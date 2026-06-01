# Arquitetura

## Coleções

### users/{uid}

```json
{
  "uid": "uid",
  "email": "email",
  "name": "nome",
  "role": "user | developer | admin",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### cases/{id}

```json
{
  "ownerId": "uid",
  "title": "string",
  "number": "string",
  "opponent": "string",
  "court": "string",
  "status": "draft | active | waiting | urgent | closed",
  "risk": "low | medium | high | critical",
  "summary": "string"
}
```

### deadlines/{id}

```json
{
  "ownerId": "uid",
  "caseId": "case id",
  "title": "string",
  "dueDate": "YYYY-MM-DD",
  "priority": "low | medium | high | critical",
  "status": "open | done"
}
```

### evidence/{id}

```json
{
  "ownerId": "uid",
  "caseId": "case id",
  "type": "document | print | audio | medical | witness | other",
  "title": "string",
  "url": "string",
  "notes": "string"
}
```

### tasks/{id}

```json
{
  "ownerId": "uid",
  "caseId": "case id",
  "title": "string",
  "priority": "low | medium | high | critical",
  "status": "todo | doing | done",
  "dueDate": "YYYY-MM-DD"
}
```

### studio/blueprint

```json
{
  "productName": "Painel Jurídico",
  "accent": "#335cff",
  "heroText": "texto",
  "modules": [],
  "fields": []
}
```

## Próximos passos reais

- Adicionar edição de prazos/provas/tarefas.
- Adicionar Firebase Storage para anexos.
- Adicionar Cloud Functions para claims reais de admin.
- Adicionar multi-tenant: `tenants/{tenantId}/...`.
- Adicionar auditoria: `auditLogs`.
- Adicionar notificações de prazo por e-mail.

