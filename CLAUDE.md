# 工作原則

## 規劃類任務

- 凡是功能設計或架構決策類任務，開始前先思考需要哪些觀點，派必要的 agent 收集後再規劃
- 簡單的 bug fix 或單一檔案修改不需要這步

## 實作類任務

- 每個 phase 完成後，派新的獨立 agent 進行 QA，不要內嵌自我 review
- QA agent 的指令必須包含「玩家會怎麼操作這個功能」的場景描述，而不只是「確認代碼能跑」

## 改動前

- 凡涉及修改的任務，必須先 Read/Grep 確認現況，不憑印象動手
- 遇到兩條以上可行路徑時，列出選項與各自代價，等用戶決定再動

## 改動範圍

- 只做被要求的事，不加沒被要求的東西
- 禁止：順手重構周邊代碼、加 console.log、加「改善」型 comment、擴充沒被要求的功能

## 完成條件

- 複雜任務開始前確認：這個任務到什麼狀態算完成？

## React 模式規範

- Modal 開啟時需要同步 state，一律用 `useEffect(() => { if (!visible) return; ... }, [visible])`，禁止用 ref callback（inline ref function 每次 render 都是新物件，會導致無限 re-render）
