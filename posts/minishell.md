---
title: "나만의 minishell 만들어보기"
date: "2025-07-26"
category: "CS"
---

# **minishell**

과제 목적

42school의 bash 작은버전을 만들어 보는 과제다. pipex 에서는 간단한 here_doc과 redirection을 구현했지만 이 과제는 pipex의 개념은 물론 기본 명령어 처리, 따옴표 처리, 빌트인 명령어, 시그널 감지, 다중 파이프 구축 을 해보는 것이다. 완전히 동작하는 쉘을 구현한다. bash의 기준에 맞춰 최대한 구현 해본다.

# **구동영상**

[minishell.webm](https://github.com/user-attachments/assets/6f4c0fb4-187b-41a6-be24-96724dfc13ef)

직접 설치 후 실행 해 보고싶으신 분들은 아래 링크에서 소스를 다운받으신 후 빌드하시면 됩니다!

[https://github.com/enKODING1/minishell](https://github.com/enKODING1/minishell)

## **과제 해결 과정**

1.  터미널에 들어오는 명령어들을 파싱하고 처리해줄 수 있는 파서 구현
2.  파서 데이터를 터미널 입력 처럼 넣을 수 있게 프롬프트를 생성 따옴표도 하나의토큰으로 구분할 수 있게 만들어야할듯 (입력 명령어들을 PATH, 절대, 상대 경로에 따라 실행할 수 있게 해줘야함)
3.  리다이렉션과 파이프 구현
4.  시그널 처리
5.  최종 합치기

## **파싱**

기본적인 파싱 과정은 \[lexing → parsing → eval\] 의 단계를 거쳐 인터프리터를 만들게 됩니다.

lexing 에서는 문자, 연산자.. 등등 구문들의 타입을 정한 후 문자열을 한줄씩 읽어들여 해당 타입이 발견되면 해당 구문을 특정 타입으로 토큰화 시킵니다. 에러 없이 토큰화를 마쳤다면 파싱을 수행 합니다.

토큰화 된 데이터들을 읽어 인터프리터가 정한 문법 규칙에 맞게 추상 구문 트리로 구조화 합니다. 최종적으로 생성된 **AST가** 인터프리터에서 요구하는 문법에 부합하게 만들어졌는지 확인하기 위해 구현합니다. AST가 완성이 되면 적절히 필요한 곳에 매핑해 사용합니다.

렉싱, 파싱 개념을 이해하는데 도움이 큰 됐던 자료.

[**This Simple Algorithm Powers Real Interpreters: Pratt Parsing**](minishell%2020bc57cc965680b4b1fed6304fb3004d/This%20Simple%20Algorithm%20Powers%20Real%20Interpreters%20Pra%2020cc57cc9656804d86d6db029bdd39ab.md)

## **토큰 정의**

```c
typedef enum e_token{
    PIPE,  |
    HEREDOC,  <<
    APPEND,   >>
    OUT,      >
    IN,       <
    WORD,     cat, filename, string, number
    END
}
```

크게 구분해야할 요소들은 PIPE, REDIRECTION(<, >, <<, >>), WORD, END 다. 각 요소들은 특정 문자가 왔을 때 뒤에 와야할 구문들이 각기 다른 요소를 기준으로 토큰화를 했다. 명령어, 명령어의 인자 를 별도의 cmd, cmd_args와 같은 토큰으로 분리하지 않고 모두 WORD토큰으로 취급하도록 했다. 파싱 단계에서 문법을 검사하며 유효하지 않는다면 에러를 발생시킬 거기 때문이다.

### **BNF정의**

파싱 후 ast를 만들어야 하는데 이때 BNF(Backus–Naur form)표기법을 이용하면 트리를 어떻게 만들어야 할지와 문법적 구조를 간단하게 확인할 수 있다. 해당 규칙을 기반으로 파서는 현재 토큰들이 올바른 위치에 왔는지 확인하고 현재 토큰 다음에 출현해야할 토큰이 아니라면 문법적 오류를 출력해줄 수 있다.

```c
<PIPE> ::= <COMMAND> [<COMMAND>"|"<PIPE>]
<COMMAND> ::= <COMMAND_ELEMENT>+
<COMMAND_ELEMENT> ::= <WORD> | <REDIRECTION>
<REDIRECTION> ::= ("<" | "<<" | ">" | ">>") <WORD>
```

가장위의 PIPE 부터 가장 아래의 요소까지 모두가 연결되어 문법 구조를 이룬다. 특정 토큰이 들어왔을 때 PIPE에 대응되는 함수를 호출 해 해당 특정 토큰이 있는 요소까지 내려가 검사를 하게 된다. 이 과정에서 현재 등장해야할 토큰이 아닌데 등장했다면 문법 오류를 뱉어내게 구현한다.

### **AST**

```bash
<< eof << eof << eof cat | cat > outfile | cat > iutfile
```

```
                [PIPE_NODE] (루트)
                 /           \
                /             \
        [CMD_NODE]             [CMD_NODE]
        /    \                   /   \
       /      \                 /     \
cmd: "cat"   [REDIR_NODE]      cmd: "cat" [REDIR_NODE]
args: (비어있음) |                        args: (비어있음) |
             [REDIR_NODE]                             type: OUT
             |                                        file: "outfile"
             [REDIR_NODE]
             |
             (세 개의 HEREDOC 노드가 연결 리스트로 연결됨)
             - type: HEREDOC, file: "eof"
             - type: HEREDOC, file: "eof"
             - type: HEREDOC, file: "eof"
```

```bash
echo "hello world" > infile
```

```
      [CMD_NODE]  <-- 이 노드가 트리의 루트(Root).
      /        \
     /           \
cmd: "echo" |    [REDIR_NODE]
args: ["hello world"]    |
                      type: OUT
                      file: "infile"
```

### **PARSER**

parser는 현재 토큰을 기반으로 문법을 분석하고 문법이 틀리지 않았다면 노드를 생성해 ast를 만들어 가는 과정이다. BNF 구조에 따라 가장 위의 비단말 기호 부분부터 아래로 내려간다. 각 비단말 기호에 대응되는 parse 함수를 만든 후 bnf 의 규칙과 동일하게 구현한다.

### **parse redirection**

```c
t_redir *parse_redirs(t_parser *parser)
{
    t_redir *redir_head = (t_redir *)ft_calloc(1, sizeof(t_redir));

    redir_head->type = peek_token(parser)->type;
    consume_token(parser);

    if (!peek_token(parser) || peek_token(parser)->type != WORD)
    {
        parser->has_error = 1;
        free(redir_head);
        return NULL;
    }

    redir_head->filename = peek_token(parser)->value;
    consume_token(parser);
    return redir_head;
}
```

### **parse command**

```c
t_node *parse_cmd(t_parser *parser)
{
    t_cmd_node *cmd_head = (t_cmd_node *)ft_calloc(1, sizeof(t_cmd_node));
    cmd_head->type = NODE_CMD;
    cmd_head->args = (char **)ft_calloc(20, sizeof(char *));

    int i = 0;
    while (peek_token(parser) && peek_token(parser)->type != PIPE && peek_token(parser)->type != END)
    {
        if (peek_token(parser)->type == WORD)
        {
           if (cmd_head->cmd == NULL)
                cmd_head->cmd = peek_token(parser)->value;
            else
                cmd_head->args[i++] = peek_token(parser)->value;
            consume_token(parser);
        }
        else if (peek_token(parser)->type >= HEREDOC && peek_token(parser)->type <= IN)
        {
            t_redir *redir = parse_redirs(parser);
            if (parser->has_error)
                return NULL;
            if (!cmd_head->redirs)
            {
                cmd_head->redirs = redir;
            }
            else
            {
                t_redir *current = cmd_head->redirs;
                while(current->next)
                    current = current->next;
                current->next = redir;
            }
        }
        else break;
    }
    return (t_node *)cmd_head;
}
```

### **parse pipe**

```c
t_node *parse_pipe(t_parser *parser)
{
    if (!peek_token(parser) || peek_token(parser)->type == END)
        return NULL;

    t_node *node = parse_cmd(parser);
    if (parser->has_error)
        return NULL;

    if (peek_token(parser) && peek_token(parser)->type == PIPE)
    {
        consume_token(parser);
        if (!peek_token(parser) || peek_token(parser)->type == END)
        {
            parser->has_error = 1;
            return NULL;
        }
        t_pipe_node *pipe = (t_pipe_node *)ft_calloc(1, sizeof(t_pipe_node));
        pipe->type = NODE_PIPE;
        pipe->left = node;
        pipe->right = parse_pipe(parser);
        if (parser->has_error) return NULL;
        return (t_node *)pipe;
    }
    return node;
}
```

## **executor**

실행기는 생성된 ast를 바탕으로 트리를 순회하며 명령어들을 하나씩 실행 시키는 기능을 하는 것이다. 실행기는 내부를 재귀로 순회하며 부모의 왼쪽에 있는 자식 그 후 오른쪽 값을 처리해 나가는 전위 순회 방식으로 구현한다. 명령어 실행 흐름을 봤을 때 전위 순회 방식으로 구현했을 때 명령어가 의도한대로 동작이 되었다.

명령어들은 execve는 실행가능한 파일을 현재 프로세스에 덮어씌워져 실행하게 되는 것이다. 그러므로 메인 프로세스에서 실행하면 안되고 자식 프로세스에서 실행해줘야한다.

### **executor(단일 명령어)**

단일 명령어의 경우 executor함수를 시작하게 될 때 pipe node일 때, cmd node 일 때를 구분했을 때 cmd node에서 실행될 때다. cmd_node에서 빌트인일때, 외부함수일때 를 구분해야한다. 외부함수일때는 fork를 해줘야한다. 외부의 실행가능한 파일을 실행할때는 execve를 사용하는데 이는 현재 프로세스를 실행가능한 파일로 대체하기 때문이다. fork를 한 후 명re령어의 경로 access가능한지 확인한 후 execve를 통해 명령어를 실행한다.

### **executor(파이프)**

파이프의 경우 executor함수를 시작하게 될 때 pipe node일 때, cmd node일 때를 구분했을 때 pipe node에서 실행될 때다. pipe node에서는 파이프를 생성하고 이를 프로세스에 잘 나눠 줘야한다.

방법1.

ast의 구조를 토대로 pipe를 만날 때 마다 자식 프로세스를 만들고 재귀를 통해 명령어를 실행한다. 이 방식의 장점은 생성된 ast그대로 순회를 하면 되기때문에 간단하다. 단점은 pipe가 제대로 이어질지와 dup2를 사용했을 때 다른 프로세스에서 동작을 제대로 할지 의문이다.

방법2.

ast의 구조에서 pipe 아래의 cmd node들을 트리 레벨에 따라 순서대로 리스트로 만들어 둔 후, 순차적으로 실행만 하면 된다. 직관적이고 간단하다. 단점은 tree구조를 flatten화 시키는 과정이 복잡할 수 있다.

방법1로 구현했다. ast 트리의 형태 그대로 실행을 했기에 가장 직관적이고 실행하기 편했다. dup, dup2도 자식 프로세스에서 잘 동작했다.

### **executor(리다이렉션)**

리다이렉션은 명령어 보다 우선 실행되어 파일 입출력 방향을 리다이렉션 해야한다. 그러므로 명령어 실행직전에 설정을 한다. builtin 명령어의 경우는 새로운 프로세스를 생성하게 되면 bash와 동작이 달라지므로 부모프로세스 자체에서 실행해야한다. redirection을 부모 프로세스에서 하게 되면 기존의 입/출력 리다이렉션을 백업 후, 명령어 실행이 끝나면 복원하는 방식으로 구현했다.

### **heredoc (bash 기준)**

<< limiter, 형식으로 터미널에 입력을 한다. heredoc만 입력시 별도의 출력은 없음. heredoc과 블로킹 명령어를 함께 사용하면 블로킹 명령어로 입력값이 들어간다. 키보드로 표준 입력을 받는다. 입력받은 문자열은 /tmp/ 내부에 파일을 생성해서 해당 파일에 데이터를 쓴다. heredoc의 limiter를 만나게 되면 임시 문자열 저장. 파일을 쓰기로 리다이렉션 한다. 그리고 unlink후 실행을 종료한다. 이렇게 구현하면 블로킹 명령어가 존재한다면 명령어의 표준입력으로 인해 값이 들어갈 것이고, 그렇지 않다면 출력되지 않을 것이다.

### **$?**

$?는 이전 명령어의 상태코드를 출력한다. 0은 에러 발생없음. 128을 넘기는 경우는 특정 signal을 의미한다.

### **변수확장**

현재 변수 확장 과정은 각 함수에서 실행된다. builtin, heredoc등 위 과정을 execute 실행되고 builtin과 외부 명령어 실행하기 전에 변수를 확장해서 값으로 넘겨야 겠다. ft_argv_filter를 사용해서 쌍따옴표, 단일 달러는 변수를 확장 시켜준다. 그럼 그 외에 홀 따옴표, 쌍 따옴표만 있는 경우 따옴표 제거를 해주나 ?
