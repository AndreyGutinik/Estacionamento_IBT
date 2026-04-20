# Alerta-IBT

Aplicativo desktop em Electron para exibir avisos no telão da igreja por meio de uma barra horizontal animada, com operação local, fila de mensagens e integração com Telegram.

O projeto foi pensado para uso simples no dia a dia: alguém pode enviar um aviso pela interface do operador ou pelo grupo do Telegram, e a mensagem aparece no monitor escolhido com scroll horizontal, confirmação de exibição e controle rápido do overlay.

## Destaques

- Overlay no topo ou rodapé do monitor selecionado
- Barra que aparece apenas quando existe mensagem
- Scroll horizontal com animação de entrada e saída
- Fila de mensagens com suporte a urgentes
- Histórico reutilizável
- Logs em formato texto para diagnóstico rápido
- Integração com Telegram por bot
- Confirmação automática no Telegram quando a mensagem termina
- Aviso automático no Telegram quando o overlay é pausado
- Correção e padronização de mensagens recebidas pelo Telegram
- Regras personalizadas de correção do Telegram
- Bloqueio de mensagens duplicadas do Telegram
- Modelos rápidos para uso manual pela interface
- Importação e exportação de configuração
- Inicialização com Windows
- Instalador Windows com `electron-builder`
- Auto-update em builds empacotadas
- API HTTP local para ligar e desligar o overlay

## Como Funciona

O app possui duas janelas principais:

- `Control`: interface do operador, onde ficam status, fila, histórico, logs e configurações
- `Overlay`: barra exibida no telão, com texto rolando da direita para a esquerda

O fluxo básico é:

1. o app inicia e carrega configuração, histórico e logs
2. cria a janela de controle e o overlay
3. inicia o polling do Telegram, se token e chat ID estiverem configurados
4. novas mensagens entram na fila
5. o overlay consome a fila e exibe uma mensagem por vez
6. ao terminar, o sistema avança automaticamente para a próxima

## Recursos Principais

### Operação local

- envio manual de mensagens pela interface
- envio normal ou urgente
- limpeza de campo
- preview do overlay por 3 segundos
- teste do monitor selecionado
- pausa e retomada do overlay

### Telegram

- leitura de mensagens por bot
- filtro por prefixo configurável
- mensagens de bot são ignoradas
- formatação automática do conteúdo
- confirmação automática após a exibição
- aviso quando o overlay é pausado
- prevenção de polling concorrente
- descarte de mensagens duplicadas recentes

### Formatação inteligente do Telegram

O app aceita mensagens livres e também mensagens guiadas com campos como:

```txt
carro: fox prata / placa: ETC-6785 / motivo: estacionado em local proibido
```

Saída no overlay:

```txt
FOX PRATA | PLACA: ETC-6785 | ESTACIONADO EM LOCAL PROIBIDO
```

Outro exemplo:

```txt
#creta preto | placa:gbr- 9003 / farol acesso
```

Saída no overlay:

```txt
CRETA PRETO | PLACA: GBR-9003 | FAROL ACESO
```

Quando o prefixo configurado for `#`, ele é tratado como comando de entrada e não aparece no overlay apenas por ser prefixo.

### Correções personalizadas

Além das correções internas do app, é possível cadastrar regras próprias na interface ou no `config.json`, por exemplo:

```txt
parado local proibid => parado em local proibido
farol acesso => farol aceso
```

### Modelos rápidos

Você pode cadastrar mensagens prontas para uso recorrente, como:

```txt
FAROL ACESO
VIDRO ABERTO
ESTACIONADO EM LOCAL PROIBIDO
```

Esses modelos aparecem na tela principal com ações rápidas:

- `Usar`
- `Enviar`
- `Urgente`

### Robustez do overlay

O overlay foi tratado como área sensível do projeto. A aplicação já possui proteções para:

- evitar flash visual no início da mensagem
- reposicionar corretamente a barra no topo ou rodapé
- recriar o overlay em caso de falha, fechamento inesperado ou travamento
- manter a fila funcionando sem perder o estado atual

## Interface

O app segue uma linha visual compacta, escura e funcional:

- tema escuro
- verde como cor principal
- tipografia Marble
- foco em operação rápida
- layout pensado para uso em janela menor, sem depender de fullscreen

## Stack

- Electron
- Node.js
- HTML
- CSS
- JavaScript
- electron-builder
- electron-updater

## Requisitos

- Windows
- Node.js LTS

## Instalação

### Opção 1: usando os arquivos `.bat`

1. instale o Node.js LTS
2. execute `instalar_dependencias.bat`
3. execute `iniciar_app.bat`

### Opção 2: usando terminal

```powershell
npm.cmd install
npm.cmd start
```

Se o PowerShell bloquear `npm` com erro de `npm.ps1`, use sempre `npm.cmd` em vez de `npm`.

## Build do Instalador

### Pelo script `.bat`

Execute:

```bat
compilar_instalador.bat
```

### Pelo terminal

```powershell
npm.cmd run dist
```

O instalador será gerado na pasta `dist/`.

Nome do instalador:

```txt
Avisos-de-Estacionamento-IBT-Setup-${version}.exe
```

## Atualizações Automáticas

O projeto já possui integração com `electron-updater`.

Em builds empacotadas:

- verifica atualizações automaticamente
- baixa a atualização
- informa o progresso nos logs
- pergunta ao usuário se deseja reiniciar para instalar

O publish está configurado para GitHub Releases no `package.json`.

## Configuração

O app grava a configuração do usuário no diretório de dados da aplicação.

Arquivo de exemplo:

- [config.example.json](./config.example.json)

Campos principais:

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

## Exemplo de Configuração

```json
{
  "telegramBotToken": "COLE_SEU_TOKEN_AQUI",
  "telegramChatId": "-1003911714658",
  "commandPrefix": "/telao",
  "displayId": "",
  "position": "bottom",
  "barHeight": 40,
  "speed": 90,
  "bgColor": "#000000",
  "textColor": "#fff7e8",
  "fontSize": 26,
  "fontFamily": "Marble, \"Marble Regular\", \"Segoe UI\", Arial, sans-serif",
  "paddingX": 24,
  "alwaysOnTop": true,
  "pollIntervalMs": 3000,
  "slideDurationMs": 300,
  "startWithWindows": false,
  "credentialsLocked": true,
  "telegramCustomCorrections": [
    { "from": "farol acesso", "to": "farol aceso" }
  ],
  "favoriteMessages": [
    "FAROL ACESO",
    "VIDRO ABERTO"
  ]
}
```

## API HTTP Local

O app sobe uma API HTTP local em:

```txt
http://127.0.0.1:8787
```

Endpoints disponíveis:

- `GET /overlay/status`
- `GET /overlay/on`
- `POST /overlay/on`
- `GET /overlay/off`
- `POST /overlay/off`

Exemplos:

```powershell
Invoke-WebRequest http://127.0.0.1:8787/overlay/status
Invoke-WebRequest http://127.0.0.1:8787/overlay/off
Invoke-WebRequest http://127.0.0.1:8787/overlay/on
```

Essa API é local e escuta apenas em `127.0.0.1`.

## Estrutura do Projeto

```txt
assets/                     icones, fontes e recursos visuais
src/
  main.js                   processo principal do Electron
  preload.js                bridge segura entre renderer e main
  control.html              interface principal
  control.js                logica da interface principal
  overlay.html              estrutura do overlay
  overlay.js                animacao e exibicao do ticker
config.example.json         configuracao de exemplo
PROJECT_CONTEXT.md          contexto funcional do projeto
CLAUDE_CONTEXT.md           contexto auxiliar para uso com Claude Code
instalar_dependencias.bat   instala dependencias
iniciar_app.bat             inicia o app
compilar_instalador.bat     gera o instalador Windows
```

## Logs e Diagnóstico

O app mantém logs de operação com foco em suporte rápido:

- inicialização do app
- status do Telegram
- erros de polling
- exibição de mensagens
- confirmações enviadas ao Telegram
- eventos de auto-update
- chamadas da API HTTP local
- descarte de mensagens duplicadas

Os logs também podem ser:

- atualizados
- copiados
- exportados
- limpos

## Segurança Operacional

O projeto tem alguns cuidados para reduzir erro humano:

- token e chat ID podem ser bloqueados visualmente por cadeado
- mensagens duplicadas do Telegram são descartadas
- o overlay pode ser pausado sem encerrar o app
- o monitor alvo é configurável
- o app evita perder estado em falhas comuns do overlay

## Comandos Úteis

Instalar dependências:

```powershell
npm.cmd install
```

Rodar em desenvolvimento:

```powershell
npm.cmd start
```

Gerar instalador:

```powershell
npm.cmd run dist
```

## Troubleshooting

### PowerShell bloqueando `npm`

Erro comum:

```txt
npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada
```

Solução:

```powershell
npm.cmd install
npm.cmd start
```

### O overlay não aparece

Verifique:

- se existe mensagem na fila
- se o overlay não está pausado
- se o monitor selecionado é o correto
- se a barra está configurada para topo ou rodapé como esperado

### Telegram não recebe ou não envia

Verifique:

- token do bot
- chat ID
- prefixo configurado
- status do Telegram na interface
- logs do app para detalhes de erro

### Mensagem não entra pelo Telegram

Verifique:

- se a mensagem começou com o prefixo aceito
- se a mensagem não foi descartada como duplicada
- se o bot tem acesso ao grupo correto

## Estado Atual do Projeto

Este projeto não foi recriado do zero. Ele vem sendo continuado e refinado de forma incremental, preservando a stack e o comportamento já existente.

As mudanças recentes priorizam:

- estabilidade
- robustez do overlay
- qualidade da integração com Telegram
- clareza operacional
- praticidade de uso para quem opera o sistema

## Contribuição

Se for continuar o desenvolvimento:

1. entenda o fluxo atual antes de refatorar
2. preserve o que já funciona
3. faça mudanças incrementais
4. trate overlay, fila e Telegram como áreas sensíveis
5. valide o comportamento antes de fechar a alteração

## Versão Atual

`6.4.2`

---

Se este projeto foi útil para a operação do telão e da equipe, deixe o repositório organizado com versões, changelog e releases para facilitar manutenção futura.
