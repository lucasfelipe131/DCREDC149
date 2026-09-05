# CREDITO C149 — Dossiê Técnico de Crédito Rural

Protótipo demonstrativo recuperado do projeto Dossiê Técnico de Crédito Rural.
Interface React responsiva com dados fictícios. Não usar para decisões reais de crédito.

## Desenho existente

- Perfis demonstrativos: consultor agronômico, atendente, analista, gerente e comitê.
- Módulos: solicitações, produtores, propriedades, documentos, mapas, viabilidade e comitê.
- Fluxo: cadastro → documentos → validação → viabilidade → dossiê → comitê.
- Solicitação: produtor, finalidade/valor, propriedades, posse, produção, pecuária,
  máquinas/ativos, garantias, documentos, revisão.
- Mapa e evidências demonstrativos; CAR, matrícula e SIGEF simulados.
- Score ilustrativo e recomendação sujeita à decisão humana.

## Limites da versão atual

Os dados e controles de análise são demonstrativos. Não há banco de dados, OCR,
consulta real ao CAR/SIGEF, integração financeira, autenticação individual por
perfil, upload durável, trilha de auditoria persistente nem motor real de crédito.
Alterações da interface podem se perder ao recarregar a página.

## Railway

O Dockerfile compila uma versão independente de Cloudflare/Sites usando o mesmo
componente de interface. O site original mantém sua configuração própria.

1. Publicar este código em um repositório privado do GitHub.
2. Conectar o repositório ao serviço Railway.
3. Configurar APP_USER e APP_PASSWORD nas variáveis do serviço; não incluí-los no Git.
4. Railway detecta Dockerfile e railway.json. PORT é fornecido pela plataforma.
5. Gerar domínio HTTPS e verificar /health, login e interface.

O servidor não inicia sem usuário e senha. A proteção usa HTTP Basic sobre HTTPS,
adequada apenas ao acesso restrito ao protótipo; não implementa perfis individuais.

```sh
npm ci
npm run build:railway
# Configure APP_USER e APP_PASSWORD no ambiente antes de iniciar.
npm run start:railway
```

## Próximas etapas propostas para o sistema operacional

1. PostgreSQL: produtores, propriedades, solicitações, anexos e histórico.
2. Autenticação individual e autorização no servidor por perfil/unidade.
3. Armazenamento privado de documentos e validação humana dos dados extraídos.
4. Cálculos financeiros e agronômicos versionados, com fontes e premissas visíveis.
5. Comparação geoespacial real e indicação explícita de dados indisponíveis.
6. Dossiê PDF, parecer do comitê e auditoria das decisões.

As etapas acima são planejamento, não funcionalidades entregues nesta versão.
