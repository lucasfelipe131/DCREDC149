# CRÉDITO C149 — Operação real

Aplicação de apoio à análise de crédito rural. A rota `/` usa PostgreSQL para
cadastros, documentos, análises e pareceres. A demonstração original permanece
separada em `/?demo=1`, identificada como fictícia e sem gravação no banco.

## Funcionalidades

- Cadastro e edição de produtores (CPF/CNPJ opcional com validação de dígitos).
- Propriedades, área, posse, município, CAR/matrícula declarados e ponto geográfico.
- Solicitações com vínculos de propriedades do produtor, valores, período e fontes.
- Upload privado de PDF, PNG, JPEG e TXT; original e SHA-256 preservados no banco.
- Fila de leitura: Poppler para PDF com texto e Tesseract português/inglês para imagem.
- Texto e sugestões por rótulos, com página e trecho de origem. Não é um leitor
  contábil universal: tabelas complexas e documentos sem rótulos exigem transcrição.
- Conferência humana antes de aplicar campos. Uma prévia mostra valores atuais e
  valores confirmados que serão substituídos; a aplicação grava a referência.
- Cálculo Price e fluxo de 12 meses, cenário adverso e fontes informadas pelo analista.
- Histórico imutável de análises e snapshots; edição de dados invalida a análise anterior.
- Parecer humano, justificativa, responsável e vínculo à análise; PDF pelo navegador.
- Usuários individuais, três perfis, ativação/desativação e trilha de auditoria.

## Fluxo de uso

1. **Produtores → Novo produtor**. Depois, cadastre as **Propriedades**.
2. **Nova solicitação**: produtor, imóveis, período, finalidade e premissas financeiras.
3. **Documentos**: envie o arquivo, confira a leitura contra o original e registre
   a conferência. Revise e aplique os campos que realmente pertencem à operação.
4. Complete valores e fontes faltantes em **Solicitações → Editar dados**.
5. **Viabilidade → Calcular análise**. Consulte os cenários, pendências e fórmulas.
6. O administrador registra o parecer em **Comitê**. Em **Dossiê**, use
   **Imprimir / salvar PDF**, escolhendo “Salvar como PDF” no navegador.

Todos os usuários pertencem à mesma carteira/unidade nesta instalação.

| Perfil | Permissões |
|---|---|
| Consulta | Ler cadastros, documentos, análises e pareceres; alterar a própria senha |
| Analista | Consulta + cadastrar/editar, enviar/conferir documentos e calcular |
| Administrador | Analista + gerenciar usuários, consultar auditoria geral e registrar parecer |

## Método financeiro e limites

Modelo versionado: `cashflow-price-12m-v1`.

- Parcela mensal: `P × i / (1 − (1+i)^−n)`. Para taxa zero: `P/n`.
- Novas parcelas em 12 meses: parcela × menor valor entre 12 e prazo em meses.
- Caixa disponível: receita operacional + outras entradas − custos operacionais,
  tributos e desembolsos − retiradas familiares.
- Serviço da dívida: parcelas existentes em 12 meses + novas parcelas em 12 meses.
- Cobertura: caixa disponível / serviço da dívida; saldo: disponível − parcelas.
- Adverso: redução percentual da receita operacional e aumento percentual dos
  custos, mantendo outras entradas, retiradas e dívida nos valores informados.

Valores devem corresponder aos mesmos 12 meses; zero é distinto de campo vazio.
O modelo usa parcelas mensais constantes, primeira em um mês, sem carência. Não
contempla CET, IOF, seguros, tarifas ou encargos não informados. Soma anual não
verifica descasamentos de caixa mensais, nem substitui modelagem de operações com
vencimentos sazonais, parcelas anuais ou carência. Não descontar parcelas existentes
novamente nos custos operacionais. Garantias são valores declarados.

Referência conceitual: [Iowa State — Financial Performance Measures](https://www.extension.iastate.edu/agdm/wholefarm/html/c3-55.html).
O indicador de caixa desta aplicação é simplificado, não uma implementação de
cada índice contábil dessa referência. Fórmulas e entradas ficam no dossiê.

Não há score, aprovação automática, concessão de crédito, consulta a dívidas reais,
bureau, CAR/SICAR, SIGEF, séries climáticas ou mapas de solo. Informações técnicas
são registradas pelo usuário e sustentadas por documentos. A leitura automática
não comprova autenticidade documental. Parecer favorável exige análise atual e
completa, imóvel vinculado, fontes financeiras e todos os documentos conferidos;
a decisão continua sendo humana e não significa liberação bancária.

## Persistência e segurança

- PostgreSQL privado, volume durável e backup diário configurado na Railway.
  Backups ainda precisam de ensaio de restauração operacional; código não os cria.
- Documentos originais `bytea`, metadados, texto, conferências e análises no banco.
- Limites: 10 MB por arquivo, 20 páginas por PDF, 25 megapixels por imagem e
  150 mil caracteres extraídos. Documento fora desses limites deve ser dividido.
- Fila no banco, um documento por vez por instância, lease de 15 minutos e limite
  de tentativas após interrupção. Falhas aparecem e permitem conferência manual.
- Extração com limite de tempo, processos sem shell e arquivos temporários removidos.
- Senhas com scrypt e salt aleatório; nenhuma senha é enviada nos endpoints de consulta.
- HTTP Basic sob HTTPS: login solicitado pelo navegador; não há MFA, SSO ou logout
  centralizado. Ao alterar senha, o navegador precisa autenticar novamente.
- Autorização aplicada no servidor; mutações exigem cabeçalho e origem permitida;
  consultas parametrizadas, proteção contra brute force e revisão otimista na solicitação.
- O usuário inicial é criado a partir de variáveis, apenas se ainda não existir.
  Mudar APP_PASSWORD depois não redefine uma senha já persistida: use a interface.
- Logs não registram credenciais nem conteúdo de documentos. Auditoria preserva as
  alterações com dados necessários à rastreabilidade e é restrita a usuários da unidade.
- Nesta primeira versão não há exclusão de cadastros/documentos nem exportação em
  lote. A listagem retorna até 2.000 produtores/imóveis e 1.000 solicitações recentes.

## Desenvolvimento e Railway

Runtime Node 22; frontend React + Vite; banco PostgreSQL; Poppler e Tesseract.

```sh
npm ci
npm test
npm run typecheck
npm run build:railway
# Defina as variáveis abaixo no ambiente seguro antes de iniciar.
npm start
```

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL; Railway: referência privada `${{Postgres.DATABASE_URL}}` |
| `APP_USER` / `APP_PASSWORD` | Bootstrap do administrador, nunca no repositório |
| `APP_ORIGIN` | URL HTTPS exata da aplicação; em desenvolvimento, origem HTTP local |
| `PORT` | Porta de escuta, padrão 3000 |

O servidor só fica pronto após migração idempotente e bootstrap. `/health` verifica
consulta ao banco, retornando `operational` e `postgresql`. Docker instala utilitários
OCR e roda o servidor como usuário sem privilégios. A imagem final instala somente
o driver PostgreSQL e suas dependências; ferramentas de build e pacotes de SSR
do protótipo não são carregados no runtime. O build Railway é independente
de Sites. `npm run dev` é apenas a interface Vite; o uso completo local exige o
servidor Node e o PostgreSQL, ou um proxy de `/api` configurado pelo desenvolvedor.

Testes executam SQL PostgreSQL com PGlite e verificam cálculo, leitura TXT,
validações, perfis, upload, conferência, aplicação, revisão, parecer e recuperação
após reabrir o armazenamento. PDFs e imagens também foram ensaiados com Poppler
/Tesseract. Isso não garante extração perfeita de qualquer documento: confirme a
qualidade no original antes de aplicar os valores.
