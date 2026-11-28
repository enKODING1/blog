use crate::posts::model::{PostInput, PostStatus};
use serde_json::Value;
use std::collections::BTreeMap;

pub const MAX_SLUG_LENGTH: usize = 200;
pub const MAX_CONTENT_BYTES: usize = 350_000;

/// `^[a-z0-9]+(?:-[a-z0-9]+)*$`: 하이픈으로 이은, 비어 있지 않은 소문자·숫자 덩어리.
fn matches_slug_pattern(slug: &str) -> bool {
    !slug.is_empty()
        && slug.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}

/// slug 오류 문구. 패턴을 먼저 본다. 패턴이 ASCII 만 허용하므로 len 은 글자 수와 같다.
pub fn slug_error(slug: &str) -> Option<String> {
    if !matches_slug_pattern(slug) {
        Some("slug는 소문자, 숫자, 하이픈만 사용할 수 있습니다.".into())
    } else if slug.len() > MAX_SLUG_LENGTH {
        Some(format!("slug는 {MAX_SLUG_LENGTH}자를 넘을 수 없습니다."))
    } else {
        None
    }
}

/// 주소로 쓸 수 있는 slug 인지(패턴과 길이).
pub fn is_valid_slug(slug: &str) -> bool {
    slug_error(slug).is_none()
}

/// `^\d{4}-\d{2}-\d{2}$` 이고 실제 달력에 있는 날짜인지.
///
/// JS `Date.UTC` 는 0–99년을 1900년대로 바꾸므로 현재 구현은 0000–0099년을 거부한다. 그대로 따른다.
fn is_real_date(value: &str) -> bool {
    let b = value.as_bytes();
    let shape = b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    if !shape {
        return false;
    }
    let (Ok(y), Ok(m), Ok(d)) = (
        value[0..4].parse::<i32>(),
        value[5..7].parse::<u32>(),
        value[8..10].parse::<u32>(),
    ) else {
        return false;
    };
    y >= 100 && chrono::NaiveDate::from_ymd_opt(y, m, d).is_some()
}

/// JS `String.prototype.trim` 과 같은 공백(유니코드 공백 + BOM).
fn is_blank(s: &str) -> bool {
    s.chars().all(|c| c.is_whitespace() || c == '\u{feff}')
}

/// 현재 `validatePostInput` 과 같은 규칙·문구.
pub fn validate(input: &Value) -> Result<PostInput, BTreeMap<String, String>> {
    let raw = match input {
        Value::Object(map) => Some(map),
        // JS 에서 배열도 object 라 필드 검사로 넘어간다(모든 필드가 없는 것으로).
        Value::Array(_) => None,
        _ => {
            return Err(BTreeMap::from([(
                "_".to_string(),
                "입력이 올바르지 않습니다.".to_string(),
            )]))
        }
    };
    let get = |k: &str| raw.and_then(|m| m.get(k));
    let str_of = |k: &str| get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let mut errors = BTreeMap::new();
    let mut err = |k: &str, msg: String| {
        errors.insert(k.to_string(), msg);
    };

    let slug = str_of("slug");
    if let Some(msg) = slug_error(&slug) {
        err("slug", msg);
    }
    let title = str_of("title");
    if is_blank(&title) {
        err("title", "제목을 입력하세요.".into());
    }
    let category = str_of("category");
    if is_blank(&category) {
        err("category", "카테고리를 입력하세요.".into());
    }
    let date = str_of("date");
    if !is_real_date(&date) {
        err("date", "날짜는 YYYY-MM-DD 형식이어야 합니다.".into());
    }
    let content = str_of("content");
    if !matches!(get("content"), Some(Value::String(_))) {
        err("content", "본문이 올바르지 않습니다.".into());
    } else if content.len() > MAX_CONTENT_BYTES {
        err(
            "content",
            format!("본문은 {MAX_CONTENT_BYTES}바이트를 넘을 수 없습니다."),
        );
    }
    let status = match get("status").and_then(Value::as_str) {
        Some("draft") => Some(PostStatus::Draft),
        Some("published") => Some(PostStatus::Published),
        _ => None,
    };
    if status.is_none() {
        err("status", "상태는 draft 또는 published 여야 합니다.".into());
    }

    match status {
        Some(status) if errors.is_empty() => Ok(PostInput {
            slug,
            title,
            category,
            date,
            content,
            status,
        }),
        _ => Err(errors),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn base() -> Value {
        json!({
            "slug": "fixed",
            "title": "제목",
            "category": "cs",
            "date": "2025-02-28",
            "content": "본문",
            "status": "published"
        })
    }

    fn with(k: &str, v: Value) -> Value {
        let mut b = base();
        b[k] = v;
        b
    }

    fn err_of(input: Value, field: &str) -> Option<String> {
        validate(&input).err().and_then(|e| e.get(field).cloned())
    }

    #[test]
    fn ok_value() {
        let v = validate(&base()).unwrap();
        assert_eq!(
            v,
            PostInput {
                slug: "fixed".into(),
                title: "제목".into(),
                category: "cs".into(),
                date: "2025-02-28".into(),
                content: "본문".into(),
                status: PostStatus::Published,
            }
        );
    }

    #[test]
    fn existing_slugs_pass() {
        for slug in [
            "42-piscine",
            "browser-rendering",
            "fixed",
            "minishell",
            "nand2tetris",
            "naval-sw-developer",
        ] {
            assert!(validate(&with("slug", json!(slug))).is_ok(), "{slug}");
            assert!(is_valid_slug(slug));
        }
    }

    #[test]
    fn bad_slugs() {
        let pattern = "slug는 소문자, 숫자, 하이픈만 사용할 수 있습니다.";
        for slug in ["Hello", "a--b", "한글", "-a", "a-", "", "../x"] {
            assert_eq!(
                err_of(with("slug", json!(slug)), "slug").as_deref(),
                Some(pattern),
                "{slug}"
            );
            assert!(!is_valid_slug(slug));
        }
        assert_eq!(
            err_of(with("slug", json!(1)), "slug").as_deref(),
            Some(pattern)
        );
        let long = "a".repeat(201);
        assert_eq!(
            err_of(with("slug", json!(long)), "slug").as_deref(),
            Some("slug는 200자를 넘을 수 없습니다.")
        );
        assert!(!is_valid_slug(&long));
        assert!(validate(&with("slug", json!("a".repeat(200)))).is_ok());
    }

    #[test]
    fn dates() {
        let msg = Some("날짜는 YYYY-MM-DD 형식이어야 합니다.");
        for d in [
            "2025-02-30",
            "2025-13-01",
            "2025-00-10",
            "2025-1-01",
            "20250101",
            "2023-02-29",
            "",
            " 2025-01-01",
        ] {
            assert_eq!(
                err_of(with("date", json!(d)), "date").as_deref(),
                msg,
                "{d}"
            );
        }
        assert_eq!(err_of(with("date", json!(null)), "date").as_deref(), msg);
        assert!(validate(&with("date", json!("2024-02-29"))).is_ok());
        assert!(validate(&with("date", json!("2025-12-31"))).is_ok());
    }

    #[test]
    fn blank_title_category() {
        assert_eq!(
            err_of(with("title", json!("")), "title").as_deref(),
            Some("제목을 입력하세요.")
        );
        assert_eq!(
            err_of(with("title", json!(" \t\n")), "title").as_deref(),
            Some("제목을 입력하세요.")
        );
        assert_eq!(
            err_of(with("category", json!("")), "category").as_deref(),
            Some("카테고리를 입력하세요.")
        );
        // title 은 trim 하지 않고 그대로 저장한다(현재 동작).
        assert_eq!(validate(&with("title", json!(" a "))).unwrap().title, " a ");
    }

    #[test]
    fn content_bytes() {
        let msg = Some("본문은 350000바이트를 넘을 수 없습니다.");
        // 한글 한 글자 = 3바이트. 116,667자 = 350,001바이트.
        let over = "가".repeat(116_667);
        assert_eq!(over.len(), 350_001);
        assert_eq!(
            err_of(with("content", json!(over)), "content").as_deref(),
            msg
        );
        // 116,666자 + "ab" = 350,000바이트(통과).
        let exact = format!("{}ab", "가".repeat(116_666));
        assert_eq!(exact.len(), 350_000);
        assert!(validate(&with("content", json!(exact))).is_ok());
        let over_ascii = "a".repeat(350_001);
        assert_eq!(
            err_of(with("content", json!(over_ascii)), "content").as_deref(),
            msg
        );
        assert_eq!(
            err_of(with("content", json!(null)), "content").as_deref(),
            Some("본문이 올바르지 않습니다.")
        );
        assert!(validate(&with("content", json!(""))).is_ok());
    }

    #[test]
    fn status() {
        let msg = Some("상태는 draft 또는 published 여야 합니다.");
        assert_eq!(
            err_of(with("status", json!("hidden")), "status").as_deref(),
            msg
        );
        assert_eq!(
            err_of(with("status", json!(null)), "status").as_deref(),
            msg
        );
        assert_eq!(
            validate(&with("status", json!("draft"))).unwrap().status,
            PostStatus::Draft
        );
    }

    #[test]
    fn not_an_object() {
        for v in [json!(null), json!("x"), json!(3)] {
            let e = validate(&v).unwrap_err();
            assert_eq!(e.len(), 1);
            assert_eq!(e["_"], "입력이 올바르지 않습니다.");
        }
    }

    #[test]
    fn collects_all_errors() {
        let e = validate(&json!({})).unwrap_err();
        let keys: Vec<_> = e.keys().map(String::as_str).collect();
        assert_eq!(
            keys,
            ["category", "content", "date", "slug", "status", "title"]
        );
    }
}
