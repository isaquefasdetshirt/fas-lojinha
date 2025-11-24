# Fade Lojinha - Updated (Auth & Logic fixes)

Este pacote corrige os problemas de autenticação e fluxo de aprovação que você reportou.
Inclui: login com senha (opcional), magia link, checagem de aprovação (is_approved/role), NavBar condicional e instruções para aprovar users.

Arquivos principais alterados:
- pages/index.js (login com opção de senha ou magic link + check is_approved)
- pages/request-access.js (signup com senha opicional)
- components/NavBar.js (esconde links quando não autenticado)
- components/ProtectedRoute.js (verifica sessão)
- lib/supabaseClient.js (client)

O que manter do seu projeto atual:
- Migrations e dados no Supabase (tabelas customers, sales, payments, payment_allocations etc.)
- Qualquer customização de funções SQL que você já tenha

Passos para rodar localmente:
1. Baixe e descompacte este ZIP.
2. No root do projeto crie um arquivo `.env.local` com as variáveis do .env.example preenchidas:

NEXT_PUBLIC_SUPABASE_URL=https://jqbwpewhipwbjuargpla.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SEU_ANON_KEY_AQUI

(Não colocar SERVICE_ROLE no .env do frontend)

3. No terminal dentro da pasta do projeto:

npm install
npm run dev

4. Abra http://localhost:3000 e teste:
 - Página de login: escolha "Entrar com senha" ou "Entrar com link".
 - Se seu usuário está marcado como is_approved = true e role = 'admin', você deverá conseguir entrar.

Como aprovar um usuário (se precisar):
- Você já rodou o SQL para atualizar raw_user_meta_data. Caso precise aprovar outro usuário, use o SQL (no painel Supabase → SQL Editor):

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"is_approved": true, "role": "collaborator"}'::jsonb
WHERE email = 'email_do_usuario@exemplo.com';

Ou use a Admin API via curl (local) com sua SERVICE_ROLE_KEY (execute localmente):

curl -X PATCH "https://<PROJECT>.supabase.co/auth/v1/admin/users/<USER_ID>"   -H "apikey: $SERVICE_ROLE_KEY"   -H "Content-Type: application/json"   -d '{"user_metadata": {"is_approved": true, "role":"collaborator"}}'

O que eu recomendo alterar depois:
- Substituir styles inline por Tailwind ou uma biblioteca de UI (Material UI / Chakra) para um visual limpo.
- Implementar uma Edge Function para aprovar usuários sem expor SERVICE_ROLE.

Se encontrar erros ao rodar, cole a mensagem aqui e eu corrijo rapidamente.
