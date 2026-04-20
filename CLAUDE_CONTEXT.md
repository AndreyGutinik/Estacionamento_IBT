# CLAUDE CONTEXT - ALERTA-IBT

## Objetivo
Este arquivo existe para dar contexto rápido e confiável ao Claude Code ao trabalhar neste projeto.

O projeto **nao e novo**.
Ele ja existe, ja foi editado anteriormente, e continua sendo desenvolvido de forma incremental.

O foco aqui e:
- continuar o app existente
- preservar o que ja funciona
- corrigir bugs sem quebrar comportamento
- aplicar mudancas pequenas e seguras

## Nome do projeto
Alerta-IBT

## Tipo de projeto
Aplicativo desktop em Electron para exibir avisos em um telao por meio de uma barra horizontal animada, com controle local e integracao com Telegram.

## Stack atual
- Electron
- Node.js
- HTML
- CSS
- JavaScript
- electron-builder

## Regra principal
Nao recrie o projeto do zero.
Nao troque a stack.
Nao remova funcionalidades existentes sem motivo.
Sempre trabalhe em cima do codigo atual.

## Como comecar antes de mexer em qualquer coisa
Antes de propor ou implementar alteracoes:
1. leia o `package.json`
2. leia a estrutura do projeto
3. leia o `PROJECT_CONTEXT.md`
4. entenda o fluxo atual do app
5. leia os arquivos relevantes da mudanca pedida

## Arquivos principais do projeto
- `package.json`
- `PROJECT_CONTEXT.md`
- `config.example.json`
- `src/main.js`
- `src/preload.js`
- `src/control.html`
- `src/control.js`
- `src/overlay.html`
- `src/overlay.js`

## Responsabilidade dos arquivos

### `src/main.js`
Responsavel pela logica principal do app:
- criacao das janelas Electron
- configuracao e reposicionamento do overlay
- polling do Telegram
- fila de mensagens
- historico
- logs
- import/export de configuracao
- confirmacoes automaticas no Telegram
- robustez e recuperacao do overlay

### `src/preload.js`
Bridge segura entre renderer e main process.

### `src/control.html`
Interface principal do operador:
- status
- fila
- historico
- logs
- configuracoes
- modelos rapidos

### `src/control.js`
Logica da interface principal:
- preencher formulario
- salvar configuracoes
- renderizar fila, historico e logs
- enviar mensagem local
- manipular modelos rapidos

### `src/overlay.html`
Estrutura visual do overlay exibido no telao.

### `src/overlay.js`
Animacao e exibicao do texto rolante no overlay.

### `config.example.json`
Exemplo de configuracao para referencia.

## Funcionalidades existentes que devem ser preservadas
- overlay no topo ou rodape do monitor selecionado
- barra aparece apenas quando existe mensagem
- animacao de entrada e saida
- scroll horizontal da mensagem
- fila de mensagens
- historico
- logs
- envio manual de mensagem local
- envio urgente
- preview do overlay
- pausa do overlay
- importacao/exportacao de configuracao
- inicializacao com Windows
- instalador Windows
- integracao com Telegram por bot
- confirmacao no Telegram quando a mensagem termina
- aviso no Telegram quando o overlay e pausado
- cadeado para bloquear edicao de token e chat ID

## Melhorias recentes ja implementadas
Estas mudancas ja existem no codigo e devem ser respeitadas:

- melhoria da robustez do overlay
- recuperacao automatica do overlay quando fecha, trava ou falha
- formatacao automatica de mensagens do Telegram
- suporte a prefixo configuravel
- quando o prefixo e `#`, o `#` nao deve aparecer no overlay apenas por ser prefixo de comando
- corretor/formalizador de mensagens do Telegram
- correcoes personalizadas do Telegram por configuracao
- bloqueio de mensagens duplicadas do Telegram
- modelos rapidos/favoritos na interface
- refinamento dos logs
- ajustes incrementais na UI compacta
- ajuste para usar `npm.cmd` no Windows quando houver bloqueio do `npm.ps1`

## Fluxo atual resumido do app

1. O app inicia e carrega configuracao, historico e logs.
2. A janela principal e criada com a interface de controle.
3. A janela de overlay e criada para o monitor configurado.
4. O polling do Telegram comeca, se token e chat ID estiverem configurados.
5. Mensagens podem entrar por:
   - interface local
   - Telegram
   - historico/modelos reutilizados
6. As mensagens entram na fila.
7. O overlay consome a fila e exibe uma mensagem por vez.
8. Ao terminar a exibicao:
   - a mensagem sai do estado atual
   - o app segue para a proxima
   - se a origem for Telegram, pode haver confirmacao automatica
9. Logs e status sao atualizados continuamente na interface.

## Fluxo atual do Telegram
- O app faz polling das atualizacoes.
- Apenas mensagens com o prefixo configurado sao aceitas.
- O texto e normalizado.
- Correcoes automáticas e personalizadas podem ser aplicadas.
- Mensagens duplicadas recentes do Telegram sao descartadas.
- A mensagem formatada entra na fila.
- Ao final da exibicao, uma confirmacao pode ser enviada de volta ao Telegram.

## Campos de configuracao importantes
- `telegramBotToken`
- `telegramChatId`
- `commandPrefix`
- `displayId`
- `position`
- `barHeight`
- `speed`
- `bgColor`
- `textColor`
- `fontSize`
- `fontFamily`
- `paddingX`
- `alwaysOnTop`
- `pollIntervalMs`
- `slideDurationMs`
- `startWithWindows`
- `credentialsLocked`
- `telegramCustomCorrections`
- `favoriteMessages`

## Estrutura dos campos novos

### `telegramCustomCorrections`
Lista de correcoes personalizadas do Telegram.
Formato conceitual:
- `from`
- `to`

Tambem pode ser editado na UI como uma regra por linha:
`texto errado => texto corrigido`

### `favoriteMessages`
Lista de mensagens-modelo para uso rapido na interface.

## Areas sensiveis do projeto
- logica do overlay
- animacoes do overlay
- polling do Telegram
- deduplicacao de mensagens do Telegram
- fila de mensagens
- confirmacoes automaticas no Telegram
- configuracao do monitor
- inicializacao com Windows
- build e instalador

## Regras de trabalho obrigatorias
- nao recriar partes do projeto sem necessidade
- nao trocar a stack
- nao apagar recursos existentes sem motivo
- nao fazer refatoracao grande so por preferencia
- fazer mudancas incrementais
- priorizar estabilidade
- entender o fluxo atual antes de editar
- preservar compatibilidade com o que ja funciona
- explicar quais arquivos serao alterados
- se encontrar um bug, explicar a causa provavel antes de corrigir
- evitar dependencias novas desnecessarias

## Comportamento esperado do Claude neste projeto
Quando eu pedir uma alteracao:

1. primeiro leia os arquivos relevantes
2. depois explique rapidamente o fluxo envolvido
3. diga quais arquivos pretende alterar
4. diga por que esses arquivos
5. se houver bug, explique a causa provavel
6. implemente apenas a menor mudanca necessaria
7. preserve o comportamento atual
8. valide o que for possivel
9. no final, resuma o que mudou

## O que o Claude NAO deve fazer
- nao recriar o app
- nao migrar framework
- nao reorganizar toda a arquitetura sem necessidade
- nao remover integracao existente
- nao sobrescrever mudancas ja feitas sem entender contexto
- nao expor tokens reais ou dados sensiveis
- nao usar comandos destrutivos de git sem pedido explicito

## Ambiente e observacoes praticas
- Sistema operacional: Windows
- Shell comum: PowerShell
- Se `npm` falhar por policy do PowerShell, usar:
  - `npm.cmd install`
  - `npm.cmd start`
- O app pode ter configuracoes reais fora do repositorio, em `AppData/Roaming`
- Nunca assumir que o estado do workspace e "limpo"

## Prompt base recomendado para novas tarefas
Use este modelo como ponto de partida:

```txt
Voce vai continuar o projeto existente Alerta-IBT no workspace atual.

Antes de alterar qualquer coisa:
1. leia o package.json
2. leia a estrutura do projeto
3. leia o PROJECT_CONTEXT.md
4. leia o CLAUDE_CONTEXT.md
5. leia os arquivos relevantes da tarefa
6. entenda o fluxo atual antes de editar

Regras:
- nao recrie o projeto do zero
- nao troque a stack
- preserve o que ja funciona
- faca mudancas incrementais
- priorize estabilidade
- nao remova funcionalidades existentes sem motivo
- explique quais arquivos vai alterar
- se encontrar um bug, explique a causa provavel antes de corrigir

Tarefa:
[DESCREVA A ALTERACAO AQUI]

Forma de resposta:
- primeiro resuma o fluxo atual relacionado a tarefa
- depois diga quais arquivos pretende alterar e por que
- depois implemente a menor mudanca necessaria
- no final, liste os arquivos alterados, o que mudou e como validou
```

## Prompt de leitura inicial recomendado
Se o Claude ainda nao conhece o projeto, use este prompt:

```txt
Leia o package.json, a estrutura do projeto, o PROJECT_CONTEXT.md e o CLAUDE_CONTEXT.md.
Depois leia os arquivos principais do app:
- src/main.js
- src/preload.js
- src/control.html
- src/control.js
- src/overlay.html
- src/overlay.js

Nao implemente nada ainda.
Primeiro me devolva:
1. resumo do fluxo atual do app
2. principais arquivos e responsabilidades
3. areas sensiveis do projeto
4. cuidados para nao quebrar o que ja existe
```

## Observacao final
Se estiver em duvida entre uma mudanca pequena e uma refatoracao grande, escolha a mudanca pequena.
Este projeto deve evoluir com seguranca, nao por reescrita.
