# Início rápido

1. Execute `instalar.bat`.
2. Edite `.env` e preencha `SENDER_NAME`, `SENDER_EMAIL`, `SENDER_PHONE`, `SMTP_*`.
3. Não altere `SEND_MODE=dry-run` durante os testes.
4. Execute `iniciar.bat` e abra `http://localhost:3210`.
5. Revise 10 empresas de alta confiança.
6. Gere testes internos e confira assunto, assinatura, fonte e remoção.
7. Configure SPF, DKIM e DMARC e execute `verificar-dns.bat`.
8. Ative o IMAP.
9. Faça um piloto pequeno.
10. Somente depois altere para `SEND_MODE=live` e `DOMAIN_AUTH_CONFIRMED=true`.
