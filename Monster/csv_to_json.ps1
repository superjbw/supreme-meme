# CSV to JS 변환 스크립트
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
        $convertedData = @()

        foreach ($row in $csvData) {
            $newRow = @{}
            foreach ($prop in $row.PSObject.Properties) {
                $value = $prop.Value
                $name = $prop.Name
                # Boolean 컬럼 (is*, has* 로 시작하는 컬럼)
                if ($name -match '^(is|has)' -and $value -match '^[01]$') {
                    $newRow[$name] = $value -eq '1'
                } elseif ($value -match '^\d+$') {
                    $newRow[$name] = [int]$value
                } elseif ($value -match '^\d+\.?\d*$') {
                    $newRow[$name] = [double]$value
                } else {
                    $newRow[$name] = $value
                }
            }
            $convertedData += [PSCustomObject]$newRow
        }

        # JS 파일로 출력
        $varName = ($baseName.ToUpper() -replace "[^A-Z0-9]", "_") + "_DATA"
        $jsonContent = $convertedData | ConvertTo-Json -Depth 10
        $jsContent = "// $baseName 데이터 (자동 생성됨)`nconst $varName = $jsonContent;`n"
        $jsContent | Out-File -FilePath $jsPath -Encoding UTF8
        Write-Host "  -> $baseName.js 완료 (변수: $varName)" -ForegroundColor Green
    }
    catch {
        Write-Host "  오류: $_" -ForegroundColor Red
    }
}

Write-Host "`n변환 완료!"
