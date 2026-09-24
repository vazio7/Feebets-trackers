# EQP Centro — Build 17

Nova organização visual baseada no layout aprovado: navegação lateral por categorias, dashboard compacto e saldo por casa.

## Novidades
- Menu lateral organizado por Início, Operação, Dinheiro, Ferramentas, Conteúdo e Conta.
- Dashboard com lucro, ROI, volume e saldo total nas casas.
- Novo módulo **Saldo por casa** com cadastro, edição e remoção de casas e saldo individual.
- Distribuição visual dos saldos e últimas operações na página inicial.
- Mantém PostgreSQL, autenticação, entitlements Basic/Pro/VIP, operações, banca, promoções, Academy, notificações e recuperação de senha.
- Mantém diagnóstico seguro do erro de envio do Resend para investigação do HTTP 403.

## Render
Start command: `python server.py`

Variáveis já usadas pelo projeto: `DATABASE_URL`, `RESEND_API_KEY`, `PASSWORD_RESET_FROM_EMAIL`, `PUBLIC_BASE_URL` e, para IA, `OPENAI_API_KEY`.
