export const userTextInputClass = 'text-sm leading-relaxed'

// 한국어는 단어 중간에서 줄을 바꾸지 않는다(break-keep). 한 줄에 안 들어가는 긴 URL은 쓰는 곳에서 wrap-anywhere를 더한다
export const userTextDisplayClass = 'text-sm leading-relaxed break-keep break-words whitespace-pre-wrap'

// 할 일 제목처럼 행의 첫 줄인 글자. body 14/20(§5)이라 첫 줄 가운데가 44 행의 가운데(22)에 온다(py-3 + 20).
// 체크와 집중 버튼이 이 줄에 맞춰 선다(Task 21)
export const userTextTitleClass = 'text-sm leading-5 break-keep break-words whitespace-pre-wrap'

export const userTextMarkdownClass = 'text-sm leading-relaxed break-words'
