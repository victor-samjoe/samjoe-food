# Tarefa 017 — SamJoE Control Center

Status: **MVP publicado em implementação**
Prioridade: **alta**

## Objetivo

Criar o painel interno da SamJoE para administrar clientes, contratos, acessos, sistemas publicados e saúde operacional sem entrar no painel de cada tenant.

## Cadastros

- [x] Criar schema isolado `control_plane` no Supabase oficial.
- [x] Criar identidade e sessão exclusivas para o proprietário da plataforma.
- [x] Registrar clientes e produtos contratados por ambiente.
- [x] Registrar assinatura, plano e valor mensal inicial.
- [ ] Organizações clientes, responsáveis, documentos e contatos.
- [ ] Produtos contratados: Food, Sales Engine e futuros sistemas.
- [ ] Ambientes, URLs, domínios, plano, situação contratual e datas importantes.
- [ ] Usuários, papéis, convites, MFA e revogação de acesso.
- [ ] Histórico de onboarding, suspensão, reativação e encerramento.

## Operação

- [x] Publicar visão master inicial com clientes, lojas, produtos, domínio e faturamento.
- [x] Separar o login master dos logins administrativos de tenant.
- [x] Exibir Sales Engine como disponível sem permitir ativação antes do endpoint oficial.
- [ ] Painel de saúde de Worker, banco, Hyperdrive, jobs e domínio/TLS.
- [ ] Estado do último deploy e commit GitHub por sistema.
- [ ] Alertas de indisponibilidade, migration pendente e credencial próxima de expirar.
- [ ] Ações controladas para criar tenant, reenviar convite, suspender e reativar.
- [ ] Auditoria imutável de toda ação administrativa.
- [ ] Visão de incidentes e procedimento de rollback.

## Segurança e arquitetura

- [ ] Tratar o Control Center como control plane separado dos dados operacionais das lojas.
- [ ] Usar identidade administrativa própria, MFA obrigatório e menor privilégio.
- [ ] Criptografar documentos e demais dados contratuais sensíveis.
- [ ] Não armazenar senhas de clientes; usar convites e redefinição segura.
- [ ] Definir retenção, acesso e exclusão segundo LGPD.
- [ ] Garantir que indisponibilidade do painel central não derrube as lojas.

## Critérios de aceite

- Um operador autorizado entende em uma tela quais clientes e sistemas estão saudáveis.
- Toda mudança administrativa identifica ator, horário, motivo e resultado.
- Nenhum operador visualiza segredo, senha ou token reutilizável.
- Suspender acesso administrativo não apaga dados nem interrompe a vitrine sem decisão explícita.
- O painel não permite acesso cruzado entre clientes.
