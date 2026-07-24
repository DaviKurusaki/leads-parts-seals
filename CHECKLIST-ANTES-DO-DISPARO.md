# Checklist antes do disparo

## Identidade e infraestrutura

- [ ] O remetente usa uma caixa corporativa real e monitorada.
- [ ] O nome, telefone, site e assinatura foram conferidos.
- [ ] SPF está publicado e inclui somente os serviços autorizados.
- [ ] DKIM está ativo e validado pelo provedor.
- [ ] DMARC está publicado e os relatórios estão sendo acompanhados.
- [ ] O SMTP passou no teste do painel.
- [ ] O IMAP está ativo para detectar respostas e remoções.

## Base de contatos

- [ ] Os contatos são corporativos e foram obtidos de fontes públicas associadas à empresa.
- [ ] Homônimos e filiais foram conferidos por cidade, telefone, endereço ou domínio.
- [ ] Leads sem fonte ou com confiança moderada foram revisados individualmente.
- [ ] A lista de supressão foi mantida.
- [ ] Nenhum endereço devolvido anteriormente será reenviado.

## Conteúdo

- [ ] A mensagem não afirma que a empresa atende um setor sem uma fonte específica.
- [ ] A localização aparece como contexto ou possibilidade, não como fato sobre o cliente.
- [ ] A recomendação de material não promete desempenho sem análise técnica.
- [ ] A pergunta final é simples e relacionada ao negócio do destinatário.
- [ ] O rodapé de remoção está presente.
- [ ] Não há anexos pesados, imagens remotas ou pixel de rastreamento no primeiro contato.

## Piloto

- [ ] Foram geradas prévias em `dry-run`.
- [ ] Foram enviados testes para caixas internas.
- [ ] O piloto contém no máximo 10 a 20 empresas de alta confiança.
- [ ] Os limites iniciais permanecem em 20/dia, 5/hora e 8 minutos de intervalo.
- [ ] Uma pessoa foi definida para acompanhar respostas no mesmo dia.

## Critérios para pausar

Pause imediatamente se ocorrer qualquer um destes sinais:

- aumento de bounces;
- pedidos frequentes de remoção;
- denúncias de spam;
- mensagens chegando em spam nas caixas de teste;
- confusão recorrente de empresa, setor ou filial;
- domínio não autenticado ou falhas de SMTP.
