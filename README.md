# CRÉDITO C149 — Operação real

Aplicação de apoio à análise de crédito rural. A rota `/` usa PostgreSQL para
cadastros, documentos, análises e pareceres. A demonstração original permanece
separada em `/?demo=1`, identificada como fictícia e sem gravação no banco.

## Funcionalidades

A interface operacional utiliza a composição original do Dossiê Rural: menu
azul-escuro recolhível, etapas no topo, resumo da operação e painéis de mapa,
propriedade, evidência documental e viabilidade. A visão do produtor reúne seu
cadastro, todas as propriedades, solicitações, documentos, fontes financeiras,
pendências e histórico, inclusive quando ainda não existe solicitação. O seletor
mantém os dados do produtor escolhido separados dos demais. A ficha atual pode
ser impressa para preparar a apresentação ao comitê, sem substituir o snapshot
do dossiê de uma análise.

O mapa interativo abre mesmo sem coordenadas. No cadastro da propriedade,
informar município/UF e sair do campo inicia a consulta de referência municipal
no IBGE. O usuário escolhe o município quando houver homônimos, marca o pin por
clique, ajusta por arraste e salva as coordenadas no próprio cadastro. Na visão
geral, também é possível marcar/ajustar o pin sem sair da página. O município
serve somente para enquadrar a região: seu centro ou seus limites nunca são
salvos como localização ou perímetro do imóvel. Pontos não medem hectares.

Base cartográfica: OpenStreetMap, com atribuição visível, cache normal do navegador
e Referer de origem; sem download em lote ou mapa offline. Referências municipais
usam as APIs de [localidades](https://servicodados.ibge.gov.br/api/docs/localidades)
e [malhas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3),
com cache de 24 horas e timeout. Nenhum nome/CPF de produtor ou pin é enviado ao
IBGE. Falhas da base e da consulta aparecem com possibilidade de tentar novamente;
coordenadas também podem ser digitadas. Satélite e tela cheia estão disponíveis
no próprio mapa e no cadastro. [Política dos tiles OSM](https://operations.osmfoundation.org/policies/tiles/).

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
   No cadastro do imóvel, informe o município, escolha o pin no mapa e salve.
   Clique no nome do produtor ou use o seletor na Visão geral para abrir sua ficha.
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
bureau, consulta cadastral automática a CAR/SIGEF, séries climáticas ou mapas de solo.
As camadas públicas CAR/SIGEF são sobreposições de referência, sem vínculo
automático com o produtor e sem consulta à situação registral. Informações técnicas
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
o driver PostgreSQL, bibliotecas de geometria e suas dependências; ferramentas de build e pacotes de SSR
do protótipo não são carregados no runtime. O build Railway é independente
de Sites. `npm run dev` é apenas a interface Vite; o uso completo local exige o
servidor Node e o PostgreSQL, ou um proxy de `/api` configurado pelo desenvolvedor.

Testes executam SQL PostgreSQL com PGlite e verificam cálculo, leitura TXT,
validações, perfis, upload, conferência, aplicação, revisão, parecer e recuperação
após reabrir o armazenamento. PDFs e imagens também foram ensaiados com Poppler
/Tesseract. Isso não garante extração perfeita de qualquer documento: confirme a
qualidade no original antes de aplicar os valores.

A cobertura inclui a ficha consolidada sem dados de outro produtor, bloqueio da
gravação de pin pelo perfil de consulta, conflito de atualização da localização,
auditoria antes/depois, preservação de outros campos e de snapshots anteriores,
invalidação das análises dependentes e persistência do pin após reabrir o banco.
O fluxo de pin usa os perfis atuais; a matriz futura de quatro perfis ainda não
está ativada. Matrículas estruturadas, polígonos, culturas por safra e aceitação de
garantias não são gerados automaticamente pela ficha.


## Mapa, áreas e KML

- **Mapa / Satélite** usa OpenStreetMap ou [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer), com atribuição permanente. Imagem de referência; data variável por região. A cultura não é inferida da imagem.
- **Tela cheia** expande a mesma instância do mapa, incluindo ferramentas, dados, filtros e editor. Escape fecha. Há fallback de viewport para navegadores sem Fullscreen API.
- **Área total**: contorno, nome, matrícula, cartório/comarca, titular informado, CAR, código SIGEF e fonte/observações. As referências são declaradas, sem consulta de cartório ou certificação automática.
- **Área produtiva / cultura**: talhão contido em uma área total da mesma propriedade, cultura atual e safra/período. Herda as referências documentais do perímetro pai. Campos ausentes continuam pendentes.
- Clique para desenhar vértices, arraste para corrigir, desfaça pontos ou edite latitude/longitude na tabela. Conclua a área; salve o mapeamento (ou o cadastro completo, quando estiver no formulário).
- Filtros por nome, tipo, cultura, matrícula, CAR e SIGEF cadastrados. É possível alternar a exibição dos vértices e das legendas de matrícula.
- Cálculo geodésico aproximado via Turf, coordenadas WGS84/EPSG:4326. Hectares declarados continuam separados dos hectares mapeados. O saldo total menos produtivo significa **sem classificação produtiva**, não área automaticamente imprópria ao cultivo.
- Polígonos simples: até 80 áreas, 500 vértices por área e 5.000 vértices por propriedade. Furos/multipolígonos e importação de arquivos externos não integram esta entrega. Áreas desconexas podem ser cadastradas como polígonos separados.
- O servidor rejeita coordenadas inválidas, anéis cruzados, vértices duplicados, área zero, talhões fora do perímetro e sobreposição entre áreas do mesmo tipo. Bordas comuns são permitidas. A validação de sobreposição é por propriedade; não certifica ausência de sobreposição com outros imóveis.
- **Baixar KML** exporta todos os polígonos da versão salva, mesmo com filtros ativos: pastas de área total/área produtiva, cores distintas, pontos V001… com coordenadas, legenda e ExtendedData contendo matrícula, cartório, titular, CAR/SIGEF, cultura, safra, áreas e origem. XML escapado; anéis fechados, longitude antes de latitude, orientação externa anti-horária.
- **Versões** abre um painel dentro do mapa com carregamento, tentativa novamente e orientação explícita quando ainda não há mapas salvos. A consulta possui limite de 15 segundos e cancela solicitações substituídas. Abrir uma versão limpa os filtros e enquadra seus polígonos; edições pendentes bloqueiam a troca de versão. No formulário de cadastro, o histórico permite consulta da lista e download, mas a abertura de geometrias históricas fica na ficha da propriedade.
- As ferramentas dentro do mapa incluem Navegar, Área total, Talhão/cultura, Áreas e dados, Camadas, Versões, Enquadrar tudo e Como usar. O desenho permite desfazer/refazer coordenadas, pausar, inserir vértices pelos sinais + e fechar pelo primeiro ponto. Dados, culturas e coordenadas ficam em painel recolhível; a barra inferior mantém salvar, concluir e KML acessíveis.
- O histórico permite consultar e exportar versões anteriores. PostgreSQL guarda cada versão com autor/data, geometria e cadastro do imóvel naquele momento. Conflitos entre editores retornam 409; não há sobrescrita silenciosa.
- A gravação no cadastro é transacional com o mapa; uma geometria inválida não deixa um cadastro parcial. O mapa também pode ser salvo isoladamente, sem sobrescrever o cadastro/pin.
- Alterações invalidam análises das solicitações que vinculam o imóvel. Novas análises preservam as versões dos mapas nos snapshots. A ficha do produtor e o dossiê mostram croquis, legendas, culturas e tabelas de vértices, com download do KML da versão correspondente.
- Migração 2 aditiva/idempotente: `properties.map_revision` e `property_map_versions`. Sem remoção de registros existentes. Analista/administrador podem gravar; perfil consulta pode visualizar e baixar o KML autenticado.

### Sobreposições oficiais

As camadas são carregadas diretamente como imagens WMS após escolher UF e aproximar para zoom 12 ou maior. Não enviam nomes/CPF, arquivos documentais ou geometrias privadas aos provedores; as requisições contêm os parâmetros públicos de camada e enquadramento do mapa. A aplicação não copia cadastros externos automaticamente nem inclui as imagens oficiais no KML. Falhas de carregamento aparecem na interface. Sem contorno visível não significa sem cadastro ou sem restrições.

| Camada | Fonte e endpoint |
|---|---|
| CAR | SICAR / Serviço Florestal Brasileiro: `https://geoserver.car.gov.br/geoserver/sicar/wms`, camada `sicar_imoveis_<uf>` |
| SIGEF particular | Acervo Fundiário / INCRA: `https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_<uf>`, camada de mesmo nome |
| Matrículas | Polígonos e dados informados no próprio cadastro, sem integração com o cartório |

Referências: [consulta CAR](https://www.car.gov.br/), [serviço de coordenadas de imóveis certificados do INCRA](https://www.gov.br/pt-br/servicos/obter-coordenadas-e-baixar-os-arquivos-dos-imoveis-ruras-certificados), [KML Reference](https://developers.google.com/kml/documentation/kmlreference).

Os testes incluem geometria côncava, cruzamentos/sobreposição, polígonos adjacentes, área em hectares, eixos/fechamento/escape XML do KML, RBAC, gravação atômica, conflito entre versões, isolamento por produtor, invalidação de análise e persistência das versões após reabrir o banco. Os WMS CAR/RS e SIGEF particular/RS foram consultados com GetCapabilities e GetMap reais nesta entrega; disponibilidade em outras UFs depende do provedor.
