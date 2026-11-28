//! 관리자 토큰(Cognito ID 토큰) 재검증.
//!
//! API Gateway 의 IAM 서명은 "Next.js 서버가 불렀다"만 보장한다. 관리자 경로는 여기서
//! 사용자 토큰을 JWKS 로 다시 검증해 "관리자가 요청했다"를 확인한다.
//! 토큰·헤더·클레임은 어떤 경우에도 로그에 남기지 않는다.

use async_trait::async_trait;
use jsonwebtoken::jwk::{AlgorithmParameters, JwkSet, KeyAlgorithm, PublicKeyUse};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// 관리자 그룹 이름.
pub const ADMIN_GROUP: &str = "blog-admin";
/// 모르는 `kid` 로 JWKS 를 다시 받는 최소 간격(위조 kid 로 Cognito 를 두드리지 못하게).
const REFETCH_INTERVAL: Duration = Duration::from_secs(60);
/// 만료 시각 허용 오차(초).
const LEEWAY_SECS: u64 = 5;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    pub groups: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    /// 서명·만료·aud·iss·token_use·형식 중 하나라도 틀림 → 401.
    Invalid,
    /// 유효한 토큰이지만 관리자 그룹이 아님 → 403.
    NotAdmin,
    /// JWKS 를 받지 못함(우리 쪽 장애) → 500.
    Unavailable,
}

#[async_trait]
pub trait TokenVerifier: Send + Sync {
    async fn verify(&self, token: &str) -> Result<Claims, AuthError>;
}

/// JWKS 를 가져오는 곳. 운영은 HTTP, 테스트는 고정 문서.
#[async_trait]
trait JwksSource: Send + Sync {
    async fn fetch(&self) -> Result<JwkSet, AuthError>;
}

struct HttpJwks {
    client: reqwest::Client,
    url: String,
}

#[async_trait]
impl JwksSource for HttpJwks {
    async fn fetch(&self) -> Result<JwkSet, AuthError> {
        let res = self.client.get(&self.url).send().await.map_err(|e| {
            tracing::error!("jwks fetch failed: {}", reqwest_kind(&e));
            AuthError::Unavailable
        })?;
        let status = res.status();
        if !status.is_success() {
            tracing::error!("jwks fetch failed: status {}", status.as_u16());
            return Err(AuthError::Unavailable);
        }
        res.json::<JwkSet>().await.map_err(|e| {
            tracing::error!("jwks fetch failed: {}", reqwest_kind(&e));
            AuthError::Unavailable
        })
    }
}

/// reqwest 오류의 종류만(URL·본문 없이).
fn reqwest_kind(e: &reqwest::Error) -> &'static str {
    if e.is_timeout() {
        "timeout"
    } else if e.is_connect() {
        "connect"
    } else if e.is_decode() {
        "decode"
    } else if e.is_body() {
        "body"
    } else if e.is_request() {
        "request"
    } else {
        "other"
    }
}

#[cfg(test)]
struct StaticJwks(JwkSet);

#[cfg(test)]
#[async_trait]
impl JwksSource for StaticJwks {
    async fn fetch(&self) -> Result<JwkSet, AuthError> {
        Ok(self.0.clone())
    }
}

#[derive(Default)]
struct KeyCache {
    keys: HashMap<String, DecodingKey>,
    last_fetch: Option<Instant>,
}

pub struct CognitoVerifier {
    source: Box<dyn JwksSource>,
    cache: tokio::sync::Mutex<KeyCache>,
    validation: Validation,
    refetch_interval: Duration,
}

/// 디코딩할 클레임. `exp`·`iss`·`aud` 는 `Validation` 이 본다.
#[derive(Deserialize)]
struct RawClaims {
    sub: String,
    token_use: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(rename = "cognito:groups", default)]
    groups: Vec<String>,
}

pub fn issuer(region: &str, pool_id: &str) -> String {
    format!("https://cognito-idp.{region}.amazonaws.com/{pool_id}")
}

pub fn jwks_url(region: &str, pool_id: &str) -> String {
    format!("{}/.well-known/jwks.json", issuer(region, pool_id))
}

impl CognitoVerifier {
    /// 운영용. HTTP 클라이언트는 여기서 한 번만 만든다. JWKS 는 처음 필요할 때 받는다.
    pub fn new(pool_id: &str, client_id: &str, region: &str) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(3))
            .build()
            .expect("failed to build HTTP client for JWKS");
        let source = HttpJwks {
            client,
            url: jwks_url(region, pool_id),
        };
        Self::with_source(pool_id, client_id, region, Box::new(source))
    }

    /// 네트워크 없이 고정 JWKS 로 검증한다(테스트용).
    #[cfg(test)]
    pub fn with_jwks(pool_id: &str, client_id: &str, region: &str, jwks: JwkSet) -> Self {
        Self::with_source(pool_id, client_id, region, Box::new(StaticJwks(jwks)))
    }

    fn with_source(
        pool_id: &str,
        client_id: &str,
        region: &str,
        source: Box<dyn JwksSource>,
    ) -> Self {
        // RS256 만. 헤더 alg 가 다르면(none·HS*·RS512 등) decode 가 거부한다.
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[issuer(region, pool_id)]);
        validation.set_audience(&[client_id]);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        validation.validate_exp = true;
        validation.leeway = LEEWAY_SECS;
        Self {
            source,
            cache: tokio::sync::Mutex::new(KeyCache::default()),
            validation,
            refetch_interval: REFETCH_INTERVAL,
        }
    }

    /// `kid` 에 맞는 공개키. 캐시에 없으면 JWKS 를 다시 받는다(키가 이미 있으면 간격 제한).
    async fn key_for(&self, kid: &str) -> Result<DecodingKey, AuthError> {
        let mut cache = self.cache.lock().await;
        if let Some(key) = cache.keys.get(kid) {
            return Ok(key.clone());
        }
        let recently = cache
            .last_fetch
            .is_some_and(|t| t.elapsed() < self.refetch_interval);
        if !cache.keys.is_empty() && recently {
            return Err(AuthError::Invalid);
        }
        cache.last_fetch = Some(Instant::now());
        let set = self.source.fetch().await?;
        cache.keys = rsa_signing_keys(&set);
        cache.keys.get(kid).cloned().ok_or(AuthError::Invalid)
    }
}

/// JWKS 에서 RS256 서명용 RSA 키만 골라 `kid` → 키 맵으로.
fn rsa_signing_keys(set: &JwkSet) -> HashMap<String, DecodingKey> {
    set.keys
        .iter()
        .filter_map(|jwk| {
            let kid = jwk.common.key_id.as_ref()?;
            let alg_ok = matches!(jwk.common.key_algorithm, None | Some(KeyAlgorithm::RS256));
            let use_ok = matches!(
                jwk.common.public_key_use,
                None | Some(PublicKeyUse::Signature)
            );
            let AlgorithmParameters::RSA(rsa) = &jwk.algorithm else {
                return None;
            };
            if !alg_ok || !use_ok {
                return None;
            }
            let key = DecodingKey::from_rsa_components(&rsa.n, &rsa.e).ok()?;
            Some((kid.clone(), key))
        })
        .collect()
}

#[async_trait]
impl TokenVerifier for CognitoVerifier {
    async fn verify(&self, token: &str) -> Result<Claims, AuthError> {
        let header = decode_header(token).map_err(|_| AuthError::Invalid)?;
        if header.alg != Algorithm::RS256 {
            return Err(AuthError::Invalid);
        }
        let kid = header.kid.ok_or(AuthError::Invalid)?;
        let key = self.key_for(&kid).await?;
        let data =
            decode::<RawClaims>(token, &key, &self.validation).map_err(|_| AuthError::Invalid)?;
        let raw = data.claims;
        if raw.token_use != "id" {
            return Err(AuthError::Invalid);
        }
        if !raw.groups.iter().any(|g| g == ADMIN_GROUP) {
            return Err(AuthError::NotAdmin);
        }
        Ok(Claims {
            sub: raw.sub,
            email: raw.email,
            groups: raw.groups,
        })
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use rsa::pkcs1::EncodeRsaPrivateKey;
    use rsa::traits::PublicKeyParts;
    use rsa::RsaPrivateKey;
    use serde_json::{json, Value};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, OnceLock};

    pub const POOL: &str = "ap-northeast-2_XzC76Ug95";
    pub const CLIENT: &str = "test-client-id";
    pub const REGION: &str = "ap-northeast-2";
    pub const KID: &str = "kid-1";

    struct TestKey {
        der: Vec<u8>,
        n: String,
        e: String,
    }

    fn gen_key() -> TestKey {
        let key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        TestKey {
            der: key.to_pkcs1_der().unwrap().as_bytes().to_vec(),
            n: URL_SAFE_NO_PAD.encode(key.n().to_bytes_be()),
            e: URL_SAFE_NO_PAD.encode(key.e().to_bytes_be()),
        }
    }

    /// 0: JWKS 에 올리는 키, 1: 공격자 키.
    fn keys() -> &'static [TestKey; 2] {
        static KEYS: OnceLock<[TestKey; 2]> = OnceLock::new();
        KEYS.get_or_init(|| [gen_key(), gen_key()])
    }

    fn jwks_of(entries: &[(&str, usize)]) -> JwkSet {
        let keys: Vec<Value> = entries
            .iter()
            .map(|(kid, i)| {
                let k = &keys()[*i];
                json!({ "kid": kid, "kty": "RSA", "alg": "RS256", "use": "sig", "n": k.n, "e": k.e })
            })
            .collect();
        serde_json::from_value(json!({ "keys": keys })).unwrap()
    }

    pub fn jwks() -> JwkSet {
        jwks_of(&[(KID, 0)])
    }

    pub fn verifier() -> CognitoVerifier {
        CognitoVerifier::with_jwks(POOL, CLIENT, REGION, jwks())
    }

    fn now() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    pub fn claims(groups: &[&str]) -> Value {
        let now = now();
        json!({
            "sub": "user-1",
            "email": "admin@example.com",
            "cognito:groups": groups,
            "aud": CLIENT,
            "iss": issuer(REGION, POOL),
            "token_use": "id",
            "iat": now,
            "exp": now + 3600,
        })
    }

    fn sign_with(claims: &Value, key: usize, kid: Option<&str>) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = kid.map(str::to_string);
        encode(
            &header,
            claims,
            &EncodingKey::from_rsa_der(&keys()[key].der),
        )
        .unwrap()
    }

    pub fn sign(claims: &Value) -> String {
        sign_with(claims, 0, Some(KID))
    }

    pub fn admin_token() -> String {
        sign(&claims(&[ADMIN_GROUP]))
    }

    async fn check(token: &str) -> Result<Claims, AuthError> {
        verifier().verify(token).await
    }

    #[tokio::test]
    async fn admin_token_is_ok() {
        let got = check(&admin_token()).await.unwrap();
        assert_eq!(got.sub, "user-1");
        assert_eq!(got.email.as_deref(), Some("admin@example.com"));
        assert_eq!(got.groups, vec![ADMIN_GROUP.to_string()]);
    }

    #[tokio::test]
    async fn missing_or_other_group_is_not_admin() {
        let mut c = claims(&[]);
        c.as_object_mut().unwrap().remove("cognito:groups");
        assert_eq!(check(&sign(&c)).await, Err(AuthError::NotAdmin));
        assert_eq!(
            check(&sign(&claims(&["readers"]))).await,
            Err(AuthError::NotAdmin)
        );
    }

    #[tokio::test]
    async fn expired_is_invalid() {
        let mut c = claims(&[ADMIN_GROUP]);
        c["exp"] = json!(now() - 3600);
        assert_eq!(check(&sign(&c)).await, Err(AuthError::Invalid));
        c.as_object_mut().unwrap().remove("exp");
        assert_eq!(check(&sign(&c)).await, Err(AuthError::Invalid));
    }

    #[tokio::test]
    async fn wrong_audience_is_invalid() {
        let mut c = claims(&[ADMIN_GROUP]);
        c["aud"] = json!("other-client");
        assert_eq!(check(&sign(&c)).await, Err(AuthError::Invalid));
        c.as_object_mut().unwrap().remove("aud");
        assert_eq!(check(&sign(&c)).await, Err(AuthError::Invalid));
    }

    #[tokio::test]
    async fn access_token_is_invalid() {
        let mut c = claims(&[ADMIN_GROUP]);
        c["token_use"] = json!("access");
        assert_eq!(check(&sign(&c)).await, Err(AuthError::Invalid));
        c.as_object_mut().unwrap().remove("token_use");
        assert_eq!(check(&sign(&c)).await, Err(AuthError::Invalid));
    }

    #[tokio::test]
    async fn wrong_issuer_is_invalid() {
        let mut c = claims(&[ADMIN_GROUP]);
        c["iss"] = json!(issuer(REGION, "ap-northeast-2_Other"));
        assert_eq!(check(&sign(&c)).await, Err(AuthError::Invalid));
    }

    #[tokio::test]
    async fn forged_signature_is_invalid() {
        // 공격자 키로 서명하고 kid 는 진짜 것을 붙인다.
        let forged = sign_with(&claims(&[ADMIN_GROUP]), 1, Some(KID));
        assert_eq!(check(&forged).await, Err(AuthError::Invalid));
        // 진짜 토큰의 본문만 바꿔치기.
        let real = admin_token();
        let parts: Vec<&str> = real.split('.').collect();
        let mut c = claims(&[ADMIN_GROUP]);
        c["sub"] = json!("someone-else");
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&c).unwrap());
        let spliced = format!("{}.{}.{}", parts[0], body, parts[2]);
        assert_eq!(check(&spliced).await, Err(AuthError::Invalid));
    }

    #[tokio::test]
    async fn other_algorithms_are_invalid() {
        let c = claims(&[ADMIN_GROUP]);
        let b64 = |v: &Value| URL_SAFE_NO_PAD.encode(serde_json::to_vec(v).unwrap());
        // alg=none, 서명 없음.
        let none = format!(
            "{}.{}.",
            b64(&json!({ "alg": "none", "typ": "JWT", "kid": KID })),
            b64(&c)
        );
        assert_eq!(check(&none).await, Err(AuthError::Invalid));
        // HS256 에 공개키 값(n)을 비밀키로 쓰는 알고리즘 혼동 공격.
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some(KID.into());
        let hs = encode(
            &header,
            &c,
            &EncodingKey::from_secret(keys()[0].n.as_bytes()).unwrap(),
        )
        .unwrap();
        assert_eq!(check(&hs).await, Err(AuthError::Invalid));
        // RS512 처럼 다른 RSA 알고리즘도 받지 않는다.
        let mut header = Header::new(Algorithm::RS512);
        header.kid = Some(KID.into());
        let rs512 = encode(&header, &c, &EncodingKey::from_rsa_der(&keys()[0].der)).unwrap();
        assert_eq!(check(&rs512).await, Err(AuthError::Invalid));
    }

    #[tokio::test]
    async fn malformed_or_unknown_kid_is_invalid() {
        for t in ["", "garbage", "a.b.c", "....."] {
            assert_eq!(check(t).await, Err(AuthError::Invalid), "{t}");
        }
        let c = claims(&[ADMIN_GROUP]);
        assert_eq!(
            check(&sign_with(&c, 0, None)).await,
            Err(AuthError::Invalid)
        );
        assert_eq!(
            check(&sign_with(&c, 0, Some("nope"))).await,
            Err(AuthError::Invalid)
        );
    }

    /// 호출 횟수를 세고, 정해진 순서대로 JWKS 를 돌려주는 소스.
    struct Scripted {
        calls: Arc<AtomicUsize>,
        sets: Vec<Option<JwkSet>>,
    }

    #[async_trait]
    impl JwksSource for Scripted {
        async fn fetch(&self) -> Result<JwkSet, AuthError> {
            let i = self.calls.fetch_add(1, Ordering::SeqCst);
            let pick = self.sets.get(i).or(self.sets.last()).cloned().flatten();
            pick.ok_or(AuthError::Unavailable)
        }
    }

    fn scripted(sets: Vec<Option<JwkSet>>) -> (CognitoVerifier, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let source = Scripted {
            calls: calls.clone(),
            sets,
        };
        let v = CognitoVerifier::with_source(POOL, CLIENT, REGION, Box::new(source));
        (v, calls)
    }

    #[tokio::test]
    async fn jwks_is_fetched_once_and_cached() {
        let (v, calls) = scripted(vec![Some(jwks())]);
        assert!(v.verify(&admin_token()).await.is_ok());
        assert!(v.verify(&admin_token()).await.is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn unknown_kid_refetches_at_most_once_per_interval() {
        let (v, calls) = scripted(vec![Some(jwks())]);
        assert!(v.verify(&admin_token()).await.is_ok());
        let c = claims(&[ADMIN_GROUP]);
        let unknown = sign_with(&c, 0, Some("rotated"));
        assert_eq!(v.verify(&unknown).await, Err(AuthError::Invalid));
        assert_eq!(v.verify(&unknown).await, Err(AuthError::Invalid));
        // 방금 받았으므로(60초 이내) 다시 받지 않는다.
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn unknown_kid_refetch_picks_up_rotated_key() {
        let rotated = jwks_of(&[(KID, 0), ("rotated", 1)]);
        let (mut v, calls) = scripted(vec![Some(jwks()), Some(rotated)]);
        v.refetch_interval = Duration::ZERO;
        assert!(v.verify(&admin_token()).await.is_ok());
        let new_token = sign_with(&claims(&[ADMIN_GROUP]), 1, Some("rotated"));
        assert!(v.verify(&new_token).await.is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        // 재조회 후에도 모르는 kid 는 한 번만 더 조회하고 거부.
        let unknown = sign_with(&claims(&[ADMIN_GROUP]), 0, Some("nope"));
        assert_eq!(v.verify(&unknown).await, Err(AuthError::Invalid));
        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn jwks_failure_is_unavailable_and_retried() {
        let (v, calls) = scripted(vec![None, Some(jwks())]);
        assert_eq!(v.verify(&admin_token()).await, Err(AuthError::Unavailable));
        // 키를 한 번도 못 받았으면 간격과 관계없이 다시 시도한다.
        assert!(v.verify(&admin_token()).await.is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn non_rsa_or_non_sig_jwks_entries_are_ignored() {
        let k = &keys()[0];
        let set: JwkSet = serde_json::from_value(json!({ "keys": [
            { "kid": KID, "kty": "RSA", "alg": "RS256", "use": "enc", "n": k.n, "e": k.e },
        ]}))
        .unwrap();
        let v = CognitoVerifier::with_jwks(POOL, CLIENT, REGION, set);
        assert_eq!(v.verify(&admin_token()).await, Err(AuthError::Invalid));
    }

    #[test]
    fn urls() {
        assert_eq!(
            jwks_url(REGION, POOL),
            "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_XzC76Ug95/.well-known/jwks.json"
        );
    }
}
