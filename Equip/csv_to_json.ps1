# CSV to JS 변환 스크립트 (Equip용)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$csvFiles = Get-ChildItem -Path . -Filter "*.csv"

if ($csvFiles.Count -eq 0) {
    Write-Host "CSV 파일이 없습니다." -ForegroundColor Yellow
    exit
}

foreach ($csvFile in $csvFiles) {
    $csvPath = $csvFile.FullName
    $baseName = $csvFile.BaseName -replace "_template", ""
    $jsPath = Join-Path $scriptPath "$baseName.js"

    Write-Host "변환 중: $($csvFile.Name)" -ForegroundColor Cyan

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
                color = $row.color
                dropWeight = [double]$row.dropWeight
                stats = [ordered]@{}
            }

            # stats 객체 구성
            if ([int]$row.defense -gt 0) { $newRow.stats.defense = [int]$row.defense }
            if ([int]$row.maxHp -gt 0) { $newRow.stats.maxHp = [int]$row.maxHp }
            if ([int]$row.attackDamage -gt 0) { $newRow.stats.attackDamage = [int]$row.attackDamage }
            if ([double]$row.speed -gt 0) { $newRow.stats.speed = [double]$row.speed }
            if ([int]$row.extraJump -gt 0) { $newRow.stats.extraJump = [int]$row.extraJump }

            $convertedData[$idStr] = $newRow
        }

        # JS 파일로 출력 (객체 형태로)
        $varName = "EQUIPMENT_DEFINITIONS"
        $jsonContent = $convertedData | ConvertTo-Json -Depth 10
        $jsContent = "// Equip 데이터 (자동 생성됨)`nconst $varName = $jsonContent;`n"

        # UTF-8 with BOM 없이 저장
        [System.IO.File]::WriteAllText($jsPath, $jsContent, [System.Text.UTF8Encoding]::new($false))

        Write-Host "  -> $baseName.js 완료 (변수: $varName)" -ForegroundColor Green
    }
    catch {
        Write-Host "  오류: $_" -ForegroundColor Red
    }
}

Write-Host "`n변환 완료!"
