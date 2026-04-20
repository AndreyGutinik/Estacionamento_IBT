# Guia de Release

Este arquivo resume o fluxo recomendado para gerar instalador e publicar novas versoes do Alerta-IBT sem reinventar o processo a cada atualizacao.

## O que foi preparado

- `scripts/release.ps1`: script principal de release
- `publicar_release.bat`: atalho para rodar o script sem bater na politica do PowerShell
- `.github/workflows/release.yml`: build e publicacao automatica no GitHub quando uma tag `v*.*.*` for enviada
- `package.json`: novos scripts para release local e release com publicacao

## Fluxo local mais simples

Para gerar um instalador local:

```bat
publicar_release.bat
```

Ou informar a versao direto:

```bat
publicar_release.bat 6.5.0
```

Se preferir pelo terminal:

```powershell
npm.cmd run release -- 6.5.0
```

## Fluxo com publicacao no GitHub Releases

Antes de publicar, defina um token com permissao de `repo`:

```powershell
setx GH_TOKEN "COLE_SEU_TOKEN_AQUI"
```

Depois feche e abra o terminal novamente.

Para publicar:

```bat
publicar_release.bat 6.5.0 publish
```

Ou:

```powershell
npm.cmd run release:publish -- 6.5.0
```

## Fluxo automatico por tag no GitHub

Depois que esta pasta estiver dentro de um repositorio git conectado ao GitHub:

```powershell
git add .
git commit -m "release: v6.5.0"
git tag v6.5.0
git push origin HEAD --tags
```

Quando a tag `v6.5.0` chegar no GitHub:

- o workflow `.github/workflows/release.yml` roda no Windows
- sincroniza a versao do `package.json` e `package-lock.json`
- instala dependencias
- gera o instalador NSIS
- publica a release no GitHub
- envia os arquivos da pasta `dist/` como artifact do workflow

## Inputs que ainda faltam para ficar 100% automatico daqui

Hoje eu preparei tudo que depende do codigo local. Para eu fechar o resto nas proximas rodadas, vao faltar estes inputs seus:

1. URL exata do repositorio GitHub que vai receber este projeto
2. Confirmacao se posso inicializar `git` nesta pasta quando voce quiser
3. Token ou estrategia de autenticacao que voce quer usar para publicar
4. Confirmacao de qual versao voce quer soltar na proxima release real

## Observacoes importantes

- O script atualiza `package.json` e `package-lock.json` para a versao informada antes de buildar.
- Se a publicacao for local com `GH_TOKEN`, o repositorio ja precisa existir no GitHub e bater com o bloco `build.publish` do `package.json`.
- Se a publicacao for por GitHub Actions, a automacao por tag depende de esta pasta estar versionada com `git`.
- O `compilar_instalador.bat` antigo foi mantido, entao o fluxo que ja funciona continua disponivel.
