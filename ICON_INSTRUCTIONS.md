# 아이콘 생성 방법

아이콘 파일이 없으면 확장 프로그램을 로드할 수 없습니다. 다음 방법 중 하나를 사용하여 아이콘을 생성하세요.

## 방법 1: 브라우저에서 생성 (권장)

1. `generate-icons.html` 파일을 브라우저에서 엽니다.
2. "아이콘 생성" 버튼을 클릭합니다.
3. "모두 다운로드" 버튼을 클릭하여 아이콘을 다운로드합니다.
4. 다운로드된 파일들(`icon16.png`, `icon48.png`, `icon128.png`)을 `icons/` 폴더에 저장합니다.

## 방법 2: 온라인 도구 사용

1. `icons/icon.svg` 파일을 사용하여 온라인 SVG to PNG 변환 도구를 사용합니다.
2. 16x16, 48x48, 128x128 크기로 변환합니다.
3. 변환된 파일들을 `icons/` 폴더에 저장합니다.

## 방법 3: ImageMagick 사용 (터미널)

```bash
cd icons
convert -background none -resize 16x16 icon.svg icon16.png
convert -background none -resize 48x48 icon.svg icon48.png
convert -background none -resize 128x128 icon.svg icon128.png
```

## 확인

아이콘 생성 후 다음 파일들이 `icons/` 폴더에 있어야 합니다:
- `icon16.png`
- `icon48.png`
- `icon128.png`

