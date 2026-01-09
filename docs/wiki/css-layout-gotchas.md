# CSS Layout Gotchas

Dokumentation av vanliga CSS-fallgropar upptäckta under utveckling.

## Flexbox och radbrytningar

### Problem
`<br />` och `whiteSpace: 'pre-line'` fungerar INTE som förväntat inuti `display: flex` containers med `align-items: center`.

Symptom:
- Text blir centrerad istället för vänsterjusterad
- Radbrytningar ignoreras eller skapar oväntad layout
- Elementen "flyter" och hamnar på fel ställen

### Lösning
Lägg `display: block` på det element som innehåller texten med radbrytningar:

```css
.element-med-radbrytningar {
  display: block;
  width: 100%;
  text-align: left;
}
```

### Exempel från projektet
I `form-client.tsx` för SKADA-events i historik-listan:
- `.history-collapsed-content` har `display: flex`
- `.history-buhs-summary` (som innehåller text med `<br />`) behöver `display: block` för att radbrytningar ska fungera

### Generell princip
Testa CSS-ändringar i isolering innan du bygger komplexa split/fragment-lösningar i React. Ofta är en enkel CSS-fix tillräcklig.
