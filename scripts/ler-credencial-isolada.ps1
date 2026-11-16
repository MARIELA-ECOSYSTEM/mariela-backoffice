# Fase 22.8.8.8.2 (M8.2) — LEITOR RESTRITO da credencial SINTÉTICA do ambiente isolado (somente leitura).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ler-credencial-isolada.ps1
#
# - O alvo é FIXO (com.mariela.backoffice.isolado:sessao:v1). Não aceita parâmetros nem argumentos: qualquer
#   argumento é recusado. Não existe variante para a credencial oficial.
# - Só chama CredReadW/CredFree. Nenhuma gravação, nenhuma exclusão.
# - NUNCA imprime access token, refresh token, chave idempotente, vínculo ou o conteúdo da credencial. Mostra apenas:
#   existência, tamanho, versão do formato, nomes dos campos, presença de pendência, prefixo curto (8 hex) do SHA-256
#   do refresh token, se o usuário da credencial é o esperado e se a estrutura é válida (regras do formato v1).

if ($args.Count -gt 0) {
    # Mensagens em ASCII: o Windows PowerShell 5.1 lê scripts sem BOM como ANSI.
    [Console]::Error.WriteLine("RECUSADO: este leitor nao aceita argumentos (o alvo e fixo).")
    exit 2
}

$ErrorActionPreference = 'Stop'
$ALVO = 'com.mariela.backoffice.isolado:sessao:v1'
$USUARIO_ESPERADO = 'mariela-backoffice-isolado'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LeitorCredencialIsolada {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
        public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;
    }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredReadW(string target, int type, int flags, out IntPtr credential);
    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr buffer);
    private const int CRED_TYPE_GENERIC = 1;
    private const int ERROR_NOT_FOUND = 1168;
    // Devolve null se a credencial não existe; lança em qualquer outra falha. `usuario` recebe o UserName e
    // `gravadaEm` o LastWritten (UTC) — metadados do Windows, não sensíveis.
    public static byte[] Ler(string alvo, out string usuario, out DateTime gravadaEm) {
        usuario = null;
        gravadaEm = DateTime.MinValue;
        IntPtr p;
        if (!CredReadW(alvo, CRED_TYPE_GENERIC, 0, out p)) {
            int erro = Marshal.GetLastWin32Error();
            if (erro == ERROR_NOT_FOUND) return null;
            throw new InvalidOperationException("Credential Manager indisponivel.");
        }
        try {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            usuario = c.UserName == IntPtr.Zero ? null : Marshal.PtrToStringUni(c.UserName);
            long ft = ((long)(uint)c.LastWritten.dwHighDateTime << 32) | (long)(uint)c.LastWritten.dwLowDateTime;
            gravadaEm = DateTime.FromFileTimeUtc(ft);
            byte[] bytes = new byte[c.CredentialBlobSize];
            if (c.CredentialBlobSize > 0) Marshal.Copy(c.CredentialBlob, bytes, 0, c.CredentialBlobSize);
            return bytes;
        } finally { CredFree(p); }
    }
}
'@

function Test-EstruturaV1($o) {
    $campos = @($o.PSObject.Properties.Name)
    if ($campos.Count -ne 5) { return $false }
    foreach ($c in 'v', 'accessToken', 'refreshToken', 'expiresAt', 'pendencia') { if ($campos -notcontains $c) { return $false } }
    if (-not ($o.v -is [int] -or $o.v -is [long]) -or $o.v -ne 1) { return $false }
    if (-not ($o.accessToken -is [string]) -or $o.accessToken -notmatch '^[A-Za-z0-9._~+/=-]{1,2048}$') { return $false }
    if (-not ($o.refreshToken -is [string]) -or $o.refreshToken -notmatch '^[A-Za-z0-9_-]{16,512}$') { return $false }
    if (-not ($o.expiresAt -is [int] -or $o.expiresAt -is [long]) -or $o.expiresAt -lt 0 -or $o.expiresAt -gt 32503680000000) { return $false }
    if ($null -ne $o.pendencia) {
        $p = $o.pendencia
        $cp = @($p.PSObject.Properties.Name)
        if ($cp.Count -ne 3) { return $false }
        if (-not ($p.vinculo -is [string]) -or $p.vinculo -cnotmatch '^[0-9a-f]{64}$') { return $false }
        if (-not ($p.chave -is [string]) -or $p.chave -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') { return $false }
        if (-not ($p.criadaEm -is [string]) -or $p.criadaEm -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$') { return $false }
    }
    return $true
}

$usuario = $null
$gravadaEm = [DateTime]::MinValue
$bytes = [LeitorCredencialIsolada]::Ler($ALVO, [ref]$usuario, [ref]$gravadaEm)
$resumo = [ordered]@{ alvo = $ALVO; existe = ($null -ne $bytes) }
if ($null -ne $bytes) {
    $resumo.bytes = $bytes.Length
    $resumo.ultimaGravacao = $gravadaEm.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $resumo.usuarioConfere = ($usuario -ceq $USUARIO_ESPERADO)
    try {
        $texto = [System.Text.Encoding]::UTF8.GetString($bytes)
        $obj = $texto | ConvertFrom-Json
        $resumo.formatoVersao = $obj.v
        $resumo.campos = @($obj.PSObject.Properties.Name | Sort-Object)
        $resumo.pendencia = $(if ($null -eq $obj.pendencia) { 'ausente' } else { 'presente' })
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes([string]$obj.refreshToken))
        $resumo.refreshSha256Prefixo = (($hash[0..3] | ForEach-Object { $_.ToString('x2') }) -join '')
        $resumo.estruturaValida = (Test-EstruturaV1 $obj)
    } catch {
        $resumo.estruturaValida = $false
    } finally {
        $texto = $null; $obj = $null; $bytes = $null
    }
}
$resumo | ConvertTo-Json -Compress
