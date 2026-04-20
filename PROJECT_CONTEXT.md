# Projeto: Alerta-IBT

## Objetivo
Aplicativo desktop em Electron para exibir avisos no telão da igreja através de uma barra horizontal animada, controlada localmente e também por mensagens recebidas no Telegram.

## Estado atual do projeto
Este projeto já vinha sendo desenvolvido antes e agora está sendo continuado dentro do VS Code.
Não é um projeto novo do zero.
Sua função é continuar, corrigir e melhorar o código existente sem quebrar os comportamentos que já funcionam.

## Stack
- Electron
- Node.js
- HTML
- CSS
- JavaScript
- electron-builder para gerar instalador Windows

## Nome do app
Alerta-IBT

## Nome do instalador
Avisos de Estacionamento - IBT

## Funcionalidades já existentes
- Exibição de barra no topo ou rodapé do monitor escolhido
- Texto rolando da direita para a esquerda
- Overlay que aparece apenas quando há mensagem
- Entrada e saída animadas da barra
- Integração com Telegram por bot
- Fila de mensagens
- Mensagem local enviada pela interface
- Mensagens urgentes
- Histórico
- Logs
- Configurações salvas
- Importar/exportar config
- Iniciar com o Windows
- Instalador Windows
- Confirmação no Telegram quando a mensagem termina de passar
- Aviso no Telegram quando o overlay é pausado
- Cadeado para bloquear edição de token e chat ID

## Regras importantes
- Não recriar o projeto do zero
- Não trocar a stack
- Não remover funcionalidades existentes sem motivo
- Sempre preservar compatibilidade com o que já funciona
- Antes de refatorar, entender o fluxo atual
- Corrigir bugs de forma incremental
- Manter o app estável
- Priorizar clareza e manutenção do código
- Sempre que possível, separar lógica de interface e lógica de overlay
- Evitar mudanças visuais radicais sem necessidade
- Preservar a identidade visual atual do app

## Identidade visual
- Tema escuro
- Verde como cor principal
- Fonte Marble
- Interface minimalista
- Textos um pouco menores para uso com janela menor, não fullscreen

## Comportamentos desejados
- Overlay aparece apenas quando houver mensagem
- Barra deve funcionar corretamente no topo e no rodapé
- Mensagem deve iniciar sem “flash” visual ou texto aparecendo no meio antes do scroll
- Status do Telegram deve exibir Online / Offline
- O app deve ser robusto contra bugs e conflitos
- Token e Chat ID devem permanecer protegidos por cadeado para evitar edição acidental

## Padrões de trabalho
Quando fizer alterações:
1. primeiro entenda o código atual
2. depois proponha a mudança mínima necessária
3. preserve compatibilidade
4. explique quais arquivos foram alterados
5. não invente dependências desnecessárias
6. se mexer em comportamento sensível, diga o motivo

## Áreas sensíveis do projeto
- Lógica do overlay e animações
- Polling do Telegram
- Fila de mensagens
- Confirmações automáticas para Telegram
- Configuração do monitor selecionado
- Geração do instalador
- Inicialização com Windows

## O que fazer ao continuar o projeto
- Continuar a partir do código existente
- Corrigir bugs
- Melhorar organização do código
- Implementar ajustes novos solicitados pelo usuário
- Não apagar recursos que já funcionam