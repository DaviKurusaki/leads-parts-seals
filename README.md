# Parts Seals — Automação de Prospecção B2B

Pacote preparado para transformar a planilha comercial em uma fila segura de prospecção personalizada.

## O que já está pronto

- Planilha `data/campanha.xlsx` com os 251 cadastros originais preservados.
- 251 conjuntos de assunto, e-mail inicial e dois follow-ups personalizados por empresa, segmento e contexto regional.
- 119 empresas com e-mail na fila; 132 permanecem bloqueadas por ausência de e-mail público confiável.
- Classificação de confiança: 82 altas, 37 moderadas e 132 baixas/sem e-mail.
- Dashboard de aprovação, edição e acompanhamento.
- Envio por SMTP com limite diário, limite por hora, intervalo mínimo e horário comercial.
- Modo seguro `dry-run`, que cria prévias em HTML sem enviar mensagens reais.
- Follow-ups automáticos somente quando não houver resposta, opt-out ou bounce.
- Sincronização opcional por IMAP para detectar respostas, remoções e devoluções.
- Lista de supressão: um lead marcado como opt-out nunca volta à fila automaticamente.
- Exportação CSV do resultado da campanha.
- Pesquisa web opcional com OpenAI, mantendo a revisão humana antes de usar os resultados.
- Verificador básico de MX, SPF, DKIM e DMARC.

## Estrutura

- `data/campanha.xlsx`: base enriquecida e textos prontos.
- `public/`: painel visual.
- `src/`: importação da planilha, servidor, agendador, SMTP, IMAP e pesquisa.
- `config/`: regras comerciais por segmento e contexto regional.
- `prompts/`: prompts de pesquisa e revisão para novos cadastros.
- `CHECKLIST-ANTES-DO-DISPARO.md`: aprovação operacional.
- `TESTE-DE-BALANCEAMENTO-LGPD.md`: modelo preenchido para revisão jurídica/administrativa.

## Instalação no Windows

1. Instale o Node.js 20 ou superior.
2. Execute `instalar.bat`.
3. Abra o arquivo `.env` criado na pasta principal.
4. Preencha remetente, SMTP, assinatura e, se desejar, IMAP/OpenAI.
5. Mantenha inicialmente:

```env
SEND_MODE=dry-run
DOMAIN_AUTH_CONFIRMED=false
```

6. Execute `iniciar.bat`.
7. Abra `http://localhost:3210`.

O `iniciar.bat` verifica as dependências, inicia o servidor em segundo plano e
abre o painel automaticamente no navegador. Se o servidor já estiver ativo, ele
apenas abre o painel novamente.

## Fluxo recomendado

### 1. Modo seguro

No painel, abra diferentes empresas, confira a fonte e revise os textos. Use **Gerar/enviar teste**. Em `dry-run`, o sistema grava o e-mail em `data/dry-run` e não envia nada.

### 2. Autenticação do domínio

Preencha `SENDER_EMAIL` e `DKIM_SELECTOR`; execute `verificar-dns.bat`. A ferramenta verifica se existem registros MX, SPF, DMARC e o seletor DKIM informado. A validação definitiva também deve ser feita no painel do provedor de e-mail.

### 3. Piloto

- Aprove manualmente 10 a 20 leads de alta confiança.
- Envie testes para uma caixa interna.
- Ative o IMAP para bloquear follow-ups quando houver resposta.
- Comece com os limites já definidos: 20/dia, 5/hora e 8 minutos entre mensagens.

### 4. Envio ao vivo

Somente depois dos testes, altere:

```env
SEND_MODE=live
DOMAIN_AUTH_CONFIRMED=true
```

Reinicie o aplicativo. O sistema ainda exige a confirmação `INICIAR CAMPANHA` no painel.

## Configuração SMTP

Use os dados fornecidos pelo provedor da conta corporativa. Configurações comuns:

- Porta 587 com `SMTP_SECURE=false`.
- Porta 465 com `SMTP_SECURE=true`.
- Em contas com autenticação em duas etapas, pode ser necessária uma senha de aplicativo.

Nunca envie o arquivo `.env` para terceiros. Ele contém credenciais.

## Apresentação comercial anexa

O primeiro e-mail de cada sequência inclui automaticamente o PDF definido em
`BROCHURE_FILE`. Os follow-ups não repetem o anexo. Para regenerar a apresentação
após alterar textos ou identidade visual, execute:

```bash
pip install -r requirements-pdf.txt
python scripts/generate_brochure.py
```

A apresentação usa a identidade visual e as fotos oficiais da Parts Seals, além
dos ícones SVG do projeto Tabler Icons, distribuídos sob licença MIT.

## Configuração IMAP

O IMAP é recomendado porque interrompe automaticamente a sequência quando:

- o destinatário responde;
- solicita remoção;
- a mensagem volta como endereço inválido.

Preencha `IMAP_*` e use `IMAP_ENABLED=true`. O classificador é conservador: qualquer resposta de um e-mail conhecido pausa os follow-ups e aguarda classificação humana.

## Pesquisa web opcional

Com `OPENAI_API_KEY` preenchida, o botão **Pesquisar empresa** usa web search para buscar:

- descrição da empresa;
- produtos e serviços;
- mercados atendidos;
- evidências e URLs;
- gancho comercial Parts Seals;
- riscos de homônimo ou informação incerta.

A pesquisa nunca aprova nem envia automaticamente. O resultado aparece no painel para revisão. Quando retornar textos estruturados, use **Aplicar texto pesquisado**; o lead continuará sem aprovação até nova conferência humana.

Também é possível pesquisar uma fila em lote, sem enviar ou aprovar nada:

```bash
npm run research -- --limit=10 --confidence=Alta
```

Para pesquisar todos gradualmente, execute novos lotes. O sistema ignora por padrão os cadastros que já possuem pesquisa.

## Regras de segurança incorporadas

1. Nenhuma empresa sem e-mail entra na fila.
2. Nenhum lead é enviado sem aprovação.
3. Opt-out, resposta e bounce bloqueiam toda a sequência.
4. A localização é tratada como hipótese comercial, não como prova de que a empresa atende determinado setor.
5. Materiais são sugestões iniciais; a seleção final depende de fluido, pressão, temperatura, velocidade, alojamento e demais dados técnicos.
6. Não há pixel de rastreamento ou coleta oculta de abertura.
7. O rodapé informa a origem corporativa do contato e oferece remoção simples.

## Atualização da planilha

A aba usada pelo sistema é `Campanha`. Para reimportar uma nova versão:

1. Feche a campanha.
2. Substitua `data/campanha.xlsx`.
3. No painel ou API, execute a reimportação com a confirmação `REIMPORTAR PLANILHA`.

A reimportação recria o estado. Exporte o CSV antes caso já existam envios ou respostas.

## Testes técnicos

```bash
npm run check
npm test
npm run dns
```

## Observação jurídica

O material implementa transparência, minimização, registro, bloqueio e descadastramento. A definição da hipótese legal e a aprovação do teste de balanceamento devem ser confirmadas pela pessoa responsável pela LGPD ou assessoria jurídica da empresa antes do envio ao vivo.
