# Início rápido

1. Para uso local, execute `iniciar.bat`; ele instala os requisitos na primeira execução.
2. Para publicar, conecte o repositório ao Netlify conforme `DEPLOY-NETLIFY.md`.
3. Cadastre no Netlify as variáveis do Supabase, SMTP e IMAP.
4. Confirme `DATA_BACKEND=supabase` e mantenha `SEND_MODE=dry-run`.
5. Abra o endereço do Netlify, entre como `Admin` e troque a senha inicial.
6. Use **Usuários** para criar ou remover acessos.
7. Revise 10 empresas de alta confiança.
8. Gere testes internos e confira assunto, assinatura, fonte e remoção.
9. Configure SPF, DKIM e DMARC e execute `verificar-dns.bat`.
10. Confirme `IMAP_SENT_MAILBOX=INBOX.enviadas` e `REQUIRE_SENT_COPY=true`.
11. Faça um piloto pequeno; somente depois use `SEND_MODE=live` e `DOMAIN_AUTH_CONFIRMED=true`.
12. Faça um novo deploy e inicie a campanha no painel. Ela enviará até 12
    mensagens por lote, a cada 15 minutos, de segunda a sexta, nas janelas de
    09:30–10:30 e 14:00–15:00.
