# Third adversarial audit by GPT-6-Astra, 18 Oct 2026 (commit 8ce0642)

Run visibly in the island tmux window `audit`, read-only. Captured from its transcript view.

```
• 8ce0642 is not ready. Verified HEAD on sandbox-v3; no files edited. TypeScript checking passed, as did all 26 existing     
  prediction assertions in an in-memory harness. Additional adversarial reproductions found failures.                        
   Required item                                        Status             Evidence                                          
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Prediction parsing and accounting                    Partly             Missing predictions now count and display,        
                                                                           including agents with no scored attempts: server/ 
                                                                           sandbox.ts:215, src/sandbox/main.ts:188. Parsing  
                                                                           still misinterprets ordinary responses; details   
                                                                           below.                                            
  ───────────────────────────────────────────────────  ─────────────────  ───────────────────────────────────────────────────
   Council fallback predictions                         Fixed              Scripted/fallback combinations explicitly predict 
                                                                           nothing: server/sandbox.ts:515.                   
   Validated council/skill payloads and guaranteed      Partly             Null entries are filtered, but arbitrary objects  
   inventory cleanup                                                       still reach String(...). A rejected parallel part 
                                                                           lets cleanup race surviving parts, duplicating    
                                                                           inventory: server/sandbox.ts:508, server/         
                                                                           sandbox.ts:554.                                   
   Pause cancels councils across every await            Partly             Epoch checks prevent later combines and teaching, 
                                                                           but slot admission has no epoch check. Plan       
                                                                           results also emit a split before checking         
                                                                           cancellation: server/sandbox.ts:456, server/      
                                                                           sandbox.ts:489.                                   
   Stable fact coordinates                              Fixed              Positions no longer depend on total fact count:   
                                                                           src/sandbox/web.ts:55.                            
   Applied minimal quality in eval                      Fixed              Eval checks quality, which comes from             
                                                                           scene.appliedQuality(); asynchronous compilation  
                                                                           has a request guard: scripts/eval-sandbox.mjs:72, 
                                                                           src/sandbox/main.ts:545, src/render/scene.ts:524. 
   Complete 640 px layout                               Partly verified    The supplied 640 px screenshot (eval-results/     
                                                                           sandbox/layout-640.png) fits, with scrollable     
                                                                           cards. Eval includes 640 px, but checks outer     
                                                                           containers and selected buttons rather than every 
                                                                           child’s clipping/overlap: scripts/eval-           
                                                                           sandbox.mjs:171.                                  
  The remaining defects, ranked:                                                                                             
  1. High: council failure duplicates inventory and permits work after closure. A valid JSON payload such as {"try":{"a":    
     {"toString":0},"b":"wood"}} throws during coercion. Promise.all rejects immediately; finally returns every outstanding  
     item and releases members. Another pending part subsequently returns its private copy again. In an isolated execution of
     the council function, inventories went [2,2] → [3,3], with a council_part emitted after closure. Validate primitive     
     fields, invalidate failed councils, and settle all parts before one authoritative cleanup.                              
  2. High: pressure continues while autonomous survival stops. Closing the last viewer stops minds and skills at server/     
     sandbox.ts:444, but hunger continues whenever running is true at server/sandbox.ts:596. Agents can therefore starve     
     unattended without being allowed to eat. Gate pressure and autonomous actions consistently.                             
  3. High: collapsed agents can execute pending decisions. Collapse clears inventory, movement and skills, but an outstanding
     model response checks only running and council membership before acting. I reproduced an action adding inventory during 
     the collapse interval. Council recruitment also accepts collapsed members. Guard action completion and council admission
     against collapse, and invalidate decisions predating it: server/sandbox.ts:119, server/sandbox.ts:418, server/          
     sandbox.ts:473.                                                                                                         
  4. Medium: Pause does not cancel queued council spending. Pause followed by Run while a part waits for a slot allows that  
     old part to launch a model call. Thread the council epoch through waitForSlot/councilCall, and check immediately after  
     every await, before publishing or mutating.                                                                             
  5. Medium: prediction marks remain unsound. Reproduced at src/sandbox/hypothesis.ts:33:                                    
      • cord, not fire becomes not cord, marking actual cord wrong.                                                          
      • it will do nothing and nothing will happen become untested ideas when nothing happens.                               
     Use canonical outcomes or a conservative parser that rejects ambiguous clauses rather than guessing.                    
  6. Medium: Pause does not freeze pressure time. Daylight, storm deadlines and collapse recovery use Date.now(). A paused   
     interval advances daylight and can expire recovery/weather deadlines: server/sandbox.ts:97. Use accumulated running     
     time.                                                                                                                   
  Food consumption, strength clamping, poisonous berries, and shelter multipliers are implemented. tower correctly           
  corresponds to the real-world wall. setDaylight updates lighting, exposure and fog with bounded daylight; I found no       
  separate defect in that function.                                                                                          
  The supplied 43/43 report was inspected, not rerun because the eval writes files. It does not exercise these failure races 
  or establish acceptable performance; it reports roughly 1 fps at minimal on its software renderer.                         
  Ready for the owner’s first play test: no; minimally fix council validation/cleanup/cancellation, conservative prediction  
  parsing, and pressure lifecycle guards, then verify those regressions and complete-layout clipping at 640 px.              
  Worked for 2m 12s • 22:59                                                                                                  

```
