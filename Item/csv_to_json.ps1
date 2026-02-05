# CSV to JS 변환 스크립트 (Item용)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$csvPath = Join-Path $scriptPath "Item.csv"
$jsPath = Join-Path $scriptPath "Item.js"

if (-not (Test-Path $csvPath)) {
    Write-Host "Item.csv 파일이 없습니다." -ForegroundColor Yellow
    exit
}

Write-Host "변환 중: Item.csv" -ForegroundColor Cyan

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
            rarity = $row.rarity
            description = $row.description
            effect = $row.effect
            value = [double]$row.value
            stackMax = [int]$row.stackMax
            dropWeight = [int]$row.dropWeight
            color = $row.color
            returnGoldValue = [int]$row.returnGoldValue
        }

        $convertedData[$idStr] = $newRow
    }

    $varName = "ITEM_DEFINITIONS"
    $jsonContent = $convertedData | ConvertTo-Json -Depth 10
    $jsContent = "// Item Data (Auto Generated)`nconst $varName = $jsonContent;`n"

    [System.IO.File]::WriteAllText($jsPath, $jsContent, [System.Text.UTF8Encoding]::new($false))

    Write-Host "  -> Item.js 완료 (변수: $varName)" -ForegroundColor Green
}
catch {
    Write-Host "  오류: $_" -ForegroundColor Red
}

Write-Host "`n변환 완료!"
