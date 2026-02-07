# UTF-8 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

$csvPath = Join-Path $PSScriptRoot "Text.csv"
$jsPath = Join-Path $PSScriptRoot "Text.js"

# UTF-8로 CSV 읽기
$csv = Import-Csv -Path $csvPath -Encoding UTF8

$output = "// Text 데이터 (자동 생성됨)`nconst TEXT_DATA = {"

$first = $true
foreach ($row in $csv) {
    if (-not $first) { $output += "," }
    $first = $false

    $output += "`n    `"$($row.key)`": {"
    $output += "`n        `"id`": $($row.id),"
    $output += "`n        `"key`": `"$($row.key)`","
    $output += "`n        `"text`": `"$($row.text)`","
    $output += "`n        `"color`": `"$($row.color)`","
    $output += "`n        `"fontSize`": $($row.fontSize),"
    $output += "`n        `"life`": $($row.life)"
    $output += "`n    }"
}

$output += "`n};`n"

# 헬퍼 함수 추가
$output += @"

// 텍스트 생성 헬퍼 함수
function createText(key, x, y, ...args) {
    const data = TEXT_DATA[key];
    if (!data) {
        console.error('Unknown text key:', key);
        return null;
    }

    let text = data.text;
    let color = data.color;

    // {0}, {1}, ... 치환
    args.forEach((arg, index) => {
        text = text.replace(``{`${index}}``, arg);
        color = color.replace(``{`${index}}``, arg);
    });

    return new DamageText(x, y, text, color, data.life, data.fontSize);
}
"@

# UTF-8 BOM 없이 저장
[System.IO.File]::WriteAllText($jsPath, $output, [System.Text.UTF8Encoding]::new($false))
Write-Host "Text.js generated successfully! (UTF-8)"
