# Mariela-Backoffice

Você está construindo o frontend do sistema MARIELA BACKOFFICE.

IMPORTANTE:

Este projeto é o frontend administrativo oficial do sistema Mariela.

Não trate este projeto como uma landing page, dashboard genérico, SaaS template ou protótipo descartável.

O objetivo é construir uma aplicação Desktop profissional de gestão de uma loja de moda feminina.

==================================================

1. STACK

==================================================

Frontend:

- React

- TypeScript

- Tauri

- Vite

- Tailwind CSS

- shadcn/ui

- React Router

- TanStack Query

- React Hook Form

- Zod

A aplicação será posteriormente empacotada utilizando Tauri.

Neste momento, o desenvolvimento pode funcionar normalmente no navegador para facilitar a implementação e validação.

Não implementar backend real neste momento.

==================================================

2. BACKEND FUTURO

==================================================

O backend real será:

- NestJS

- TypeScript

- REST

- JSON

- MongoDB

- Mongoose

- Redis

- BullMQ

- S3-compatible para mídia

O frontend NÃO deve assumir PostgreSQL, Drizzle, Prisma ou qualquer outro banco.

Não criar código de backend.

==================================================

3. OBJETIVO DESTA FASE

==================================================

Construir o Backoffice com uma API MOCKADA.

Entretanto, a API mockada deve possuir exatamente o mesmo contrato planejado para a API real.

A futura substituição deverá ser:

API MOCK

   ↓

API REST NestJS

sem necessidade de reescrever os componentes da interface.

O frontend deve possuir uma camada de serviços/API.

Os componentes React NÃO devem acessar diretamente os mocks.

ERRADO:

const produtos = mockProdutos;

CORRETO:

const produtos = await produtosApi.listar();

A implementação mockada deve ficar atrás da mesma interface que futuramente consumirá HTTP.

==================================================

4. ARQUITETURA DO FRONTEND

==================================================

Organizar o projeto aproximadamente assim:

src/

  components/

  layouts/

  pages/

  routes/

  hooks/

  services/

    api/

      client.ts

      auth.api.ts

      produtos.api.ts

      estoque.api.ts

      configuracoes.api.ts

      clientes.api.ts

      fornecedores.api.ts

      colecoes.api.ts

      campanhas.api.ts

    mock/

      auth.mock.ts

      produtos.mock.ts

      estoque.mock.ts

      configuracoes.mock.ts

      clientes.mock.ts

      fornecedores.mock.ts

      colecoes.mock.ts

      campanhas.mock.ts

  types/

    auth.ts

    produto.ts

    variante.ts

    estoque.ts

    configuracoes.ts

    cliente.ts

    fornecedor.ts

    colecao.ts

    campanha.ts

  utils/

Não é obrigatório seguir literalmente cada pasta caso a estrutura idiomática do projeto seja diferente, mas deve existir clara separação entre:

UI

↓

hooks

↓

services

↓

API/mock

==================================================

5. API CLIENT

==================================================

Criar uma camada de API que futuramente permita trocar o mock pelo backend real.

Base URL:

VITE_API_URL=/api/v1

Criar client HTTP centralizado.

Preparar suporte para:

- GET

- POST

- PUT

- PATCH

- DELETE

Também preparar:

- tratamento de erros

- status HTTP

- autenticação

- loading

- timeout

- interceptação futura de token

==================================================

6. FORMATO DAS RESPOSTAS

==================================================

Toda API deve simular o formato:

{

  "data": {},

  "meta": {}

}

ou:

{

  "data": {}

}

Erros:

{

  "statusCode": 400,

  "code": "VALIDATION_ERROR",

  "message": "Dados inválidos.",

  "errors": [

    {

      "field": "nome",

      "message": "Nome é obrigatório."

    }

  ]

}

==================================================

7. IDENTIDADE DO MARIELA

==================================================

O sistema deve possuir identidade visual própria.

Nome:

MARIELA

É um sistema de gestão para uma loja de moda feminina.

A interface deve transmitir:

- elegância

- organização

- simplicidade

- sofisticação

- profissionalismo

Evitar aparência de:

- sistema bancário

- ERP industrial

- CRM genérico

- dashboard SaaS genérico

A interface deve ser moderna, limpa e profissional.

Priorizar:

- excelente hierarquia visual

- espaçamento consistente

- tipografia elegante

- tabelas fáceis de ler

- formulários claros

- feedback visual

- estados vazios bem construídos

- confirmação para ações destrutivas

Não exagerar em gradientes, sombras ou elementos decorativos.

==================================================

8. LAYOUT

==================================================

Criar layout principal:

┌───────────────────────────────────────────────┐

│ Header                                        │

├──────────────┬────────────────────────────────┤

│              │                                │

│ Sidebar      │ Conteúdo                      │

│              │                                │

│              │                                │

│              │                                │

└──────────────┴────────────────────────────────┘

Sidebar fixa.

Header contendo:

- título da página

- breadcrumbs quando necessário

- usuário logado

- menu do usuário

Sidebar:

Dashboard

Catálogo

  Produtos

  Estoque

Comercial

  Clientes

  Fornecedores

  Vendas

  Caixa

Marketing

  Coleções

  Campanhas

Relatórios

Configurações

Integrações

Neste primeiro ciclo, implementar completamente:

- Dashboard

- Produtos

- Variantes

- Estoque

- Configurações

Os demais módulos devem possuir navegação preparada, mas podem apresentar estado "Em desenvolvimento" até serem implementados.

==================================================

9. ROTAS

==================================================

Criar rotas:

/login

/dashboard

/produtos

/produtos/novo

/produtos/:id

/produtos/:id/editar

/produtos/:id/variantes

/estoque

/estoque/:produtoId

/configuracoes

Clientes:

/clientes

Fornecedores:

/fornecedores

Coleções:

/colecoes

Campanhas:

/campanhas

Vendas:

/vendas

Caixa:

/caixa

Relatórios:

/relatorios

Integrações:

/integracoes

==================================================

10. AUTENTICAÇÃO MOCK

==================================================

Criar login mockado.

Endpoint conceitual:

POST /auth/login

Request:

{

  "usuario": "admin",

  "senha": "123456"

}

Response:

{

  "data": {

    "accessToken": "mock-token",

    "usuario": {

      "id": "usr_001",

      "nome": "Administrador",

      "tipo": "ADMIN"

    }

  }

}

Criar:

GET /auth/me

O frontend deve proteger as rotas administrativas.

Não criar níveis adicionais de permissão.

Neste momento existe somente:

ADMIN

O vendedor pertence ao futuro sistema MARIELA PDV e não deve ser tratado como usuário do Backoffice.

==================================================

11. PRODUTOS

==================================================

Implementar completamente o módulo Produtos.

Modelo:

{

  id: string,

  codProduto: string,

  nome: string,

  descricao?: string,

  categoria: string,

  colecaoId?: string | null,

  campanhaId?: string | null,

  fornecedorId?: string | null,

  precoCusto: number,

  margemLucro: number,

  precoVenda: number,

  ehNovidade: boolean,

  ehPromocao: boolean,

  precoPromocional?: number | null,

  quantidadeTotal: number,

  estoqueZeradoEm?: string | null,

  variantes: Variante[],

  criadoEm: string,

  atualizadoEm: string

}

==================================================

12. VARIANTES

==================================================

Modelo:

{

  id: string,

  codVariante: string,

  cor: string,

  quantidadeVariante: number,

  foto: string | null,

  video: string | null,

  tamanhos: [

    {

      id: string,

      tamanho: string,

      quantidade: number

    }

  ]

}

Regras:

Uma variante representa uma cor do produto.

Não permitir duas variantes com a mesma cor dentro do mesmo produto.

Não permitir dois tamanhos iguais dentro da mesma variante.

Produto pode existir sem variantes.

Produto pode existir sem estoque.

==================================================

13. PRODUTO SEM ESTOQUE

==================================================

O cadastro inicial do produto NÃO cria estoque.

Fluxo:

Criar produto

↓

Produto cadastrado

↓

Quantidade total = 0

↓

Nenhuma variante obrigatória

Posteriormente o usuário acessa:

Produto

→ Variantes

→ Adicionar variante

==================================================

14. CADASTRO DE VARIANTE

==================================================

Tela/modal:

Adicionar variante

Campos:

Código da variante

Cor

Foto

Vídeo

A cor deve vir das configurações.

Se a cor já estiver cadastrada naquele produto:

mostrar erro:

"Esta cor já está cadastrada neste produto."

==================================================

15. TAMANHOS

==================================================

Depois de criar a variante, permitir adicionar tamanhos.

Exemplo:

Variante:

Preto

Tamanhos:

PP → 5

P → 3

M → 8

G → 2

Para produtos de tamanho único:

usar:

U

Exemplo:

Preto

U → 10

Não permitir tamanho duplicado na mesma variante.

==================================================

16. ESTOQUE

==================================================

Não criar uma entidade independente chamada estoque.

O estoque pertence ao produto.

Estrutura:

Produto

 └── quantidadeTotal

 └── variantes

       └── quantidadeVariante

             └── tamanhos

                   └── quantidade

Regras:

quantidadeVariante =

soma das quantidades dos tamanhos daquela variante.

quantidadeTotal =

soma das quantidades de todas as variantes.

O frontend pode apresentar esses valores, mas não deve tratá-los como fonte de verdade.

==================================================

17. ENTRADA DE ESTOQUE

==================================================

Permitir:

Adicionar quantidade a tamanho existente.

Exemplo:

M = 5

Entrada +3

Resultado:

M = 8

Também permitir:

Criar novo tamanho em uma variante existente.

Exemplo:

Variante Preto

PP = 5

M = 8

Adicionar G = 4

Resultado:

PP = 5

M = 8

G = 4

==================================================

18. SAÍDA DE ESTOQUE

==================================================

Criar ação:

"Saída de estoque"

Permitir informar:

Quantidade

Motivo

Nunca permitir quantidade negativa.

Permitir zerar o estoque.

Exemplo:

M = 5

Saída = 5

Resultado:

M = 0

==================================================

19. AJUSTE MANUAL

==================================================

A interface deverá possuir ações:

Entrada de estoque

Saída de estoque

Não permitir diretamente editar a quantidade digitando um novo número.

A quantidade deve ser alterada por operação.

==================================================

20. ESTADO DO PRODUTO

==================================================

Não criar campo ativo no produto.

A disponibilidade será determinada pela quantidade total.

quantidadeTotal > 0

Produto disponível.

quantidadeTotal = 0

Produto sem estoque.

Mostrar visualmente:

Disponível

ou

Sem estoque

==================================================

21. ESTOQUE ZERADO

==================================================

Quando o estoque chegar a zero:

estoqueZeradoEm = data atual

Quando voltar a possuir estoque:

estoqueZeradoEm = null

O backend futuro será responsável pela regra de expurgo após mais de 30 dias sem estoque.

O frontend NÃO deve excluir automaticamente produtos por tempo.

==================================================

22. PREÇOS

==================================================

Produto possui:

precoCusto

margemLucro

precoVenda

precoPromocional

ehPromocao

A margem representa o percentual calculado conforme o preço final válido.

Preço final:

Se ehPromocao = true:

precoFinal = precoPromocional

Caso contrário:

precoFinal = precoVenda

O frontend deve apresentar claramente:

Preço de custo

Preço de venda

Preço promocional

Margem

==================================================

23. PROMOÇÃO

==================================================

A promoção deve possuir uma ação separada.

Na tela do produto:

[Ativar promoção]

Quando ativada:

ehPromocao = true

Solicitar:

precoPromocional

Mostrar:

Preço normal: R$ 160,00

Preço promocional: R$ 129,90

Quando desativada:

ehPromocao = false

precoPromocional pode permanecer salvo, mas deixa de ser o preço vigente.

==================================================

24. LISTAGEM DE PRODUTOS

==================================================

Criar tabela profissional.

Colunas:

Foto

Código

Produto

Categoria

Preço

Estoque

Status

Novidade

Promoção

Ações

Ações:

Visualizar

Editar

Gerenciar variantes

Promoção

Excluir

Adicionar estoque

Filtros:

Busca

Categoria

Coleção

Campanha

Fornecedor

Disponibilidade

Promoção

Novidade

Ordenação:

Nome

Código

Preço

Estoque

Data de criação

==================================================

25. DETALHES DO PRODUTO

==================================================

Criar uma página profissional de detalhes.

Estrutura:

Informações gerais

Código

Nome

Descrição

Categoria

Coleção

Campanha

Fornecedor

Preços

Custo

Venda

Promoção

Margem

Estoque

Quantidade total

Variantes

Cada variante deve aparecer como card/seção:

Foto

Cor

Código

Quantidade total da variante

Tamanhos

PP

P

M

G

GG

U

Ações:

Editar variante

Adicionar tamanho

Entrada

Saída

==================================================

26. CONFIGURAÇÕES

==================================================

Implementar inicialmente:

Dados da loja

Categorias

Tamanhos

Cores

Formas de pagamento

Modelo:

{

  loja: {

    nome: string,

    logo: string,

    telefone: string,

    whatsapp: string,

    email: string,

    endereco: {

      cep: string,

      logradouro: string,

      numero: string,

      complemento: string,

      bairro: string,

      cidade: string,

      estado: string

    }

  },

  categorias: string[],

  tamanhos: string[],

  cores: string[],

  formasPagamento: string[],

  atualizadoEm: string

}

Categorias, tamanhos, cores e formas de pagamento devem funcionar como listas administráveis.

==================================================

27. DADOS MOCKADOS

==================================================

Criar dados suficientes para tornar a interface realista.

Não utilizar somente 2 ou 3 produtos.

Criar pelo menos:

15 produtos

Produtos com:

- diferentes categorias

- diferentes preços

- produtos sem estoque

- produtos com estoque baixo

- produtos com múltiplas variantes

- produtos com uma única variante

- produtos de tamanho único

- produtos promocionais

- produtos marcados como novidade

Criar pelo menos:

5 fornecedores

10 categorias

8 tamanhos

10 cores

5 formas de pagamento

==================================================

28. COMPORTAMENTO DOS MOCKS

==================================================

Os mocks devem simular comportamento real.

Não retornar dados estáticos cegamente.

Exemplo:

POST entrada de estoque

↓

alterar quantidade da variante

↓

alterar quantidade do tamanho

↓

recalcular quantidadeVariante

↓

recalcular quantidadeTotal

↓

atualizar atualizadoEm

A mesma regra deve acontecer na saída.

Criar pequeno delay artificial:

100–400ms

para simular rede.

Isso permitirá testar:

loading

skeleton

erro

sucesso

==================================================

29. TANSTACK QUERY

==================================================

Utilizar TanStack Query para:

- listagens

- detalhes

- mutations

- invalidação de cache

Exemplo conceitual:

useQuery({

  queryKey: ['produtos']

})

Após entrada de estoque:

invalidateQueries(['produtos'])

e atualizar os dados exibidos.

==================================================

30. FORMULÁRIOS

==================================================

Utilizar:

React Hook Form

+

Zod

Validar:

Campos obrigatórios

Preço > 0

Margem válida

Quantidade >= 0

Código obrigatório

Categoria obrigatória

Cor obrigatória

Tamanho obrigatório

Não permitir valores inválidos.

==================================================

31. FEEDBACK

==================================================

Toda ação deve fornecer feedback.

Sucesso:

Toast:

"Produto criado com sucesso."

Entrada:

"Estoque atualizado com sucesso."

Erro:

"Não foi possível atualizar o estoque."

Confirmações destrutivas:

"Tem certeza que deseja excluir este produto?"

==================================================

32. ESTADOS DE INTERFACE

==================================================

Todas as telas devem possuir:

Loading

Skeleton

Empty state

Error state

Success state

Exemplo:

Nenhum produto encontrado.

"Não encontramos produtos para os filtros selecionados."

Botão:

"Limpar filtros"

==================================================

33. MODAIS

==================================================

Utilizar modais/drawers para ações rápidas quando fizer sentido.

Exemplos:

Adicionar variante

Adicionar tamanho

Entrada de estoque

Saída de estoque

Ativar promoção

Confirmar exclusão

Não transformar toda interação em uma nova página.

==================================================

34. RESPONSIVIDADE

==================================================

Embora o sistema seja Desktop, a interface deve se adaptar a diferentes tamanhos de janela.

Priorizar:

1366x768

1440x900

1920x1080

Não é necessário criar uma experiência mobile completa.

==================================================

35. ACESSIBILIDADE

==================================================

Utilizar:

labels

aria-label quando necessário

foco correto em dialogs

navegação por teclado

contraste adequado

mensagens de erro associadas aos campos

==================================================

36. PERFORMANCE

==================================================

Evitar:

renderizações desnecessárias

componentes gigantes

estado global desnecessário

duplicação de dados

Manter componentes reutilizáveis.

==================================================

37. NÃO FAZER

==================================================

NÃO criar backend.

NÃO criar PostgreSQL.

NÃO criar Drizzle.

NÃO criar Prisma.

NÃO criar Next.js.

NÃO criar autenticação real.

NÃO criar MongoDB local.

NÃO criar estoque como collection independente.

NÃO duplicar estoque fora do produto.

NÃO criar vendedores como usuários do Backoffice.

NÃO implementar ainda regras de vendas.

NÃO implementar caixa.

NÃO implementar checkout.

NÃO implementar parcelas.

NÃO implementar cancelamento de venda.

NÃO implementar devolução.

NÃO inventar regras de negócio que não estejam especificadas.

==================================================

38. PREPARAÇÃO PARA O BACKEND REAL

==================================================

O frontend deverá consumir tipos que correspondam ao contrato da API.

Não acoplar componentes à estrutura dos mocks.

Exemplo:

ProdutoPage

↓

useProduto()

↓

produtosApi.obter(id)

↓

API mock

Futuramente:

produtosApi.obter(id)

↓

HTTP

↓

NestJS

↓

MongoDB

Sem alteração da página.

==================================================

39. API MOCK

==================================================

Criar uma implementação mockada das APIs:

Auth

Produtos

Variantes

Estoque

Configurações

Clientes

Fornecedores

Coleções

Campanhas

Apenas Produtos, Variantes, Estoque e Configurações precisam estar funcionais nesta primeira etapa.

Os demais serviços podem possuir mocks básicos para que a navegação e filtros funcionem.

==================================================

40. QUALIDADE DO CÓDIGO

==================================================

Priorizar:

TypeScript strict

tipos explícitos

componentes pequenos

funções reutilizáveis

hooks reutilizáveis

schemas Zod

tratamento de erros

nomes claros

sem código duplicado

sem valores mágicos espalhados pelo projeto

==================================================

41. RESULTADO ESPERADO

==================================================

Ao finalizar esta etapa, quero conseguir abrir o Backoffice e:

1. Fazer login como administrador.

2. Visualizar Dashboard.

3. Abrir Produtos.

4. Pesquisar produtos.

5. Filtrar produtos.

6. Criar produto.

7. Editar produto.

8. Visualizar produto.

9. Criar variante.

10. Adicionar tamanho.

11. Fazer entrada de estoque.

12. Fazer saída de estoque.

13. Impedir estoque negativo.

14. Visualizar quantidade total.

15. Visualizar quantidade por variante.

16. Visualizar quantidade por tamanho.

17. Ativar promoção.

18. Desativar promoção.

19. Excluir produto.

20. Administrar categorias.

21. Administrar tamanhos.

22. Administrar cores.

23. Administrar formas de pagamento.

Tudo isso deve funcionar usando a API MOCKADA.

==================================================

42. IMPORTANTE SOBRE REGRAS DE NEGÓCIO

==================================================

As regras especificadas neste documento são requisitos do sistema.

Não simplifique regras para facilitar a implementação.

Não invente campos.

Não invente entidades.

Não crie collections fictícias.

Não altere os nomes dos campos definidos.

Se existir alguma ambiguidade, NÃO tome uma decisão silenciosa.

Primeiro sinalize a ambiguidade e explique a decisão proposta.

==================================================

43. EXECUÇÃO

==================================================

Antes de começar:

1. Analise o projeto atual.

2. Verifique a stack existente.

3. Não substitua silenciosamente uma tecnologia existente.

4. Se a estrutura atual for incompatível com React + TypeScript + Vite, informe antes de fazer uma migração.

5. Não instale tecnologias incompatíveis com esta especificação.

Depois:

1. Criar a arquitetura base.

2. Criar layout.

3. Criar API mock.

4. Criar tipos.

5. Criar autenticação mock.

6. Criar Dashboard.

7. Criar Produtos.

8. Criar Variantes.

9. Criar Estoque.

10. Criar Configurações.

11. Validar todos os fluxos.

12. Corrigir erros.

13. Garantir que o projeto compile.

Não considerar o trabalho concluído apenas porque a interface foi criada.

Validar efetivamente os fluxos de:

CRUD de produto

CRUD de variante

CRUD de tamanho

entrada de estoque

saída de estoque

promoção

configurações

login

==================================================

44. REGRA FINAL

==================================================

O objetivo não é criar apenas uma interface visual.

O objetivo é criar o primeiro frontend funcional do MARIELA, utilizando uma API mockada que respeita o contrato da futura API NestJS.

A arquitetura deve permitir substituir a API mockada pela API real sem reescrever a aplicação.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mariela-chic-admin.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0ae0ffe9-090f-41ee-8c9a-a13c9836c702).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
