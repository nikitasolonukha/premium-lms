# Защита репозитория

30.09.2026 настройки main применены через GitHub API и повторно прочитаны: PR обязателен, Code checks и Database security and E2E обязательны от GitHub Actions app 15368, strict/up-to-date включён, force push и deletion запрещены, enforce admins включён, требуется разрешение conversations. Для solo project required approving review count=0; это сохраняет обязательный PR/CI.

Dependabot alerts включены (GET vulnerability-alerts → 204), automated security fixes enabled=true/paused=false. Secret scanning и push protection были включены и остаются включёнными. Dependabot создаёт проверяемые PR; auto merge не настроен.

Проверка:

```sh
gh api repos/nikitasolonukha/premium-lms/branches/main/protection
gh api repos/nikitasolonukha/premium-lms/vulnerability-alerts --include
gh api repos/nikitasolonukha/premium-lms/automated-security-fixes
gh api repos/nikitasolonukha/premium-lms --jq .security_and_analysis
```

Доказательство конфигурации хранится отдельно от результата CI. Зелёная защита ветки не означает, что последний PR прошёл все tests. При переименовании jobs обновляйте required contexts одновременно; иначе merge останется заблокирован. Не используйте admin bypass для выпуска не прошедшего checks commit.

Если новый GitHub plan/settings запрещает API-изменение, повторите эти значения в Settings → Branches → main protection, а Security → Code security включите alerts/scanning/push protection. Зафиксируйте фактический ответ или screenshot, а не только намерение.

[GitHub branch protection API](https://docs.github.com/en/rest/branches/branch-protection).
