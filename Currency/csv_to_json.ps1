# CSV to JS 변환 스크립트 (Currency용)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$csvPath = Join-Path $scriptPath "Currency.csv"
$jsPath = Join-Path $scriptPath "Currency.js"

if (-not (Test-Path $csvPath)) {
    Write-Host "Currency.csv 파일이 없습니다." -ForegroundColor Yellow
    exit
}

Write-Host "변환 중: Currency.csv" -ForegroundColor Cyan

try {
    $csvData = Import-Csv -Path $csvPath -Encoding UTF8
    $convertedData = [ordered]@{}

    foreach ($row in $csvData) {
        $id = [int]$row.id
        $idStr = $id.ToString()
        $newRow = [ordered]@{
            id = $id
            type = $row.type
            name = $row.name
            description = $row.description
            maxAmount = [long]$row.maxAmount
            color = $row.color
            icon = $row.icon
        }

        $convertedData[$idStr] = $newRow
    }

    $varName = "CURRENCY_DEFINITIONS"
    $jsonContent = $convertedData | ConvertTo-Json -Depth 10
    $jsContent = "// Currency Data (Auto Generated)`nconst $varName = $jsonContent;`n"

    [System.IO.File]::WriteAllText($jsPath, $jsContent, [System.Text.UTF8Encoding]::new($false))

    Write-Host "  -> Currency.js 완료 (변수: $varName)" -ForegroundColor Green
}
catch {
    Write-Host "  오류: $_" -ForegroundColor Red
}

Write-Host "`n변환 완료!"
