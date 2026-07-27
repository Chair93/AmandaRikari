# Como publicar o Rikari online (grátis, no Fly.io)

Esse guia assume que você já tem o código no GitHub. Siga na ordem.

## 1. Criar conta no Fly.io

1. Entre em https://fly.io e crie uma conta grátis.
2. Instale o `flyctl` no seu computador — siga o instalador oficial: https://fly.io/docs/flyctl/install/
3. No terminal, rode:
   ```
   fly auth login
   ```
   (abre o navegador pra você confirmar o login)

## 2. Baixar o projeto e lançar o app

No terminal, na pasta onde você quer guardar o projeto:

```
git clone https://github.com/Chair93/AmandaRikari.git
cd AmandaRikari
```

O arquivo `fly.toml` já vem pronto no projeto com o nome `amanda-rikari`. Como nomes de app no Fly são únicos no mundo todo, esse nome pode já estar em uso — se der erro de nome duplicado, abra o `fly.toml` e troque a linha `app = "amanda-rikari"` por outro nome (ex: `amanda-rikari-clinica`).

Crie o volume onde o banco de dados vai morar (isso é o que garante que seus dados não se percam):

```
fly volumes create rikari_data --size 1 --region gru
```

Defina a senha secreta de login (troque o texto entre aspas por qualquer frase longa e aleatória):

```
fly secrets set JWT_SECRET="troque-por-uma-frase-bem-aleatoria-e-longa"
```

(Opcional, só se quiser que o app envie e-mails de recuperação de senha e resumo diário — pode pular isso por enquanto e configurar depois):

```
fly secrets set SMTP_HOST=smtp.seuservico.com SMTP_PORT=587 SMTP_USER=seu@email.com SMTP_PASS=suasenha SMTP_FROM="Rikari <no-reply@seudominio.com>"
```

Agora publique:

```
fly deploy
```

Isso vai demorar alguns minutos na primeira vez (constrói a imagem, sobe pro Fly). Quando terminar, o terminal mostra a URL tipo `https://amanda-rikari.fly.dev` — abra e teste o cadastro/login.

## 3. Apontar o domínio da GoDaddy

1. No painel da GoDaddy, vá em **Meus produtos > Domínios > (seu domínio) > DNS**.
2. Adicione um registro:
   - Se quiser usar o domínio raiz (ex: `seudominio.com`): tipo **A**, nome **@**, valor: o IP que o comando abaixo mostrar.
     ```
     fly ips list
     ```
   - Se preferir um subdomínio (ex: `app.seudominio.com`, mais simples): tipo **CNAME**, nome **app**, valor **amanda-rikari.fly.dev** (ou o nome que você escolheu).
3. Depois, no Fly, registre o domínio:
   ```
   fly certs create app.seudominio.com
   ```
   (troque pelo domínio/subdomínio escolhido). O Fly cuida do certificado HTTPS sozinho — pode levar de alguns minutos a algumas horas pra propagar.

## 4. Atualizações futuras

Sempre que quiser publicar uma mudança nova: `git pull`, aplique as mudanças, `git push`, depois rode `fly deploy` de novo na pasta do projeto.

## Notas importantes

- O banco de dados (SQLite) fica guardado no volume `rikari_data` — ele **não** é apagado a cada deploy, mas se você excluir o volume ou o app no Fly, os dados vão junto. Use o botão "Backup (.json)" dentro do próprio app (Ajustes) de vez em quando pra ter uma cópia de segurança à parte.
- O plano grátis do Fly cobre bem o uso de uma clínica pequena. Se o app "dormir" por inatividade e a primeira abertura do dia demorar alguns segundos a mais, é esperado (`auto_stop_machines`) — ele acorda sozinho.
