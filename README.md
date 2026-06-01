# Painel Jurídico Studio

Projeto experimental mais complexo: **portal jurídico com login Firebase para usuários** + **Developer Studio** para desenvolvimento/configuração do sistema.

## Ideia da arquitetura

Existem duas camadas:

1. **Portal do usuário**
   - Processos
   - Prazos
   - Provas
   - Tarefas
   - Status
   - Busca global
   - Exportação JSON
   - Dados separados por `ownerId`

2. **Developer Studio**
   - Área para administrador/desenvolvedor
   - Configuração de módulos
   - Configuração de campos
   - Tema/identidade do sistema
   - Data Explorer
   - Blueprint salvo em `studio/blueprint`

Isso é inspirado no conceito de admin/CMS/builder, mas o código é próprio.

## Firebase usado

O arquivo `src/firebase-config.js` já contém a configuração enviada:

```js
projectId: "painel-jurisico"
```

## Como rodar

Abra com um servidor local, não apenas clicando no HTML:

```bash
npx serve .
```

Ou publique no GitHub Pages/Firebase Hosting.

## Configurar Firebase

No Firebase Console:

1. Ative **Authentication → Email/Password**.
2. Ative **Firestore Database**.
3. Em Authentication → Settings → Authorized domains, adicione:
   - `localhost`
   - seu domínio do GitHub Pages
   - seu domínio final, se houver

## Regras Firestore

O arquivo `firestore.rules` está incluso.

Ele permite:

- usuário comum criar/ler/editar só dados próprios;
- `developer/admin` ler e alterar tudo;
- `studio/blueprint` só pode ser escrito por developer/admin.

## Como virar developer

Crie sua conta normalmente pelo app.

Depois, no Firestore Console, vá em:

```text
users/{seu_uid}
```

E altere:

```json
"role": "developer"
```

Recarregue o app. O menu **Developer Studio** aparece.

## Deploy Firebase Hosting

Instale Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

## GitHub Pages

Também funciona em GitHub Pages, mas você precisa adicionar o domínio gerado em:

```text
Firebase Console → Authentication → Settings → Authorized domains
```

## Arquivos

```text
index.html
styles.css
src/app.js
src/firebase-config.js
firestore.rules
firebase.json
.firebaserc
package.json
docs/ARCHITECTURE.md
```

## Observação importante

A chave web do Firebase não é senha secreta. A segurança real vem das regras Firestore, do domínio autorizado e da separação por `ownerId`.

