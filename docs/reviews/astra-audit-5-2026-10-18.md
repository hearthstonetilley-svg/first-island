# Fifth adversarial audit by GPT-6-Astra, 18 Oct 2026 (commit 2cb9960)

Run visibly in the island tmux window `audit`, read-only.

```
• Not ready yet. Audited 2cb9960; no files edited. TypeScript passed, all 34 prediction assertions passed, and isolated      
  recovery/cancellation reproductions ran in memory. I did not rerun the browser eval.                                       
   Claimed fix                                              Verdict    Evidence                                              
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Reject ambiguous predictions                             Partly     The four added examples pass. But cord not nothing    
                                                                       becomes not cord, marking actual cord incorrect; cord 
                                                                       steel becomes cord, marking it correct. The parser    
                                                                       counts only recognized material names and applies     
                                                                       negation globally. src/sandbox/hypothesis.ts:43, src/ 
                                                                       sandbox/hypothesis.ts:52.                             
  ───────────────────────────────────────────────────────  ─────────  ───────────────────────────────────────────────────────
   Recovery across restart                                  Partly     New saves correctly preserve the clock: a collapse at 
                                                                       one hour recovered after another 20 seconds. Legacy   
                                                                       hour-scale and wall-clock deadlines also recovered.   
                                                                       However, a legacy deadline of 59000 survives          
                                                                       migration unchanged and requires 59 seconds from      
                                                                       restart. Only deadlines beyond 60 seconds are reset.  
                                                                       server/sandbox.ts:598, server/sandbox.ts:609, server/ 
                                                                       sandbox.ts:615.                                       
   No council parts after cancellation                      Fixed      Pending-part reproduction emitted zero parts after    
                                                                       Pause, returned all four items, and closed the        
                                                                       council. server/sandbox.ts:554.                       
   Validate model fields before coercion                    Partly     Skill steps and council plan/merge fields are fixed.  
                                                                       However, teach_skill:[{"toString":0}] and share:      
                                                                       [{"toString":0}] still throw during act, aborting the 
                                                                       decision. Reproduced both. server/sandbox.ts:255,     
                                                                       server/sandbox.ts:270.                                
   Confirm malformed injection; judge conservation after    Partly     Injection is now asserted and conservation checked    
   cancellation                                                        later. But ledger checks still silently skip while    
                                                                       any council is open; the eval never asserts that a    
                                                                       completed ledger comparison occurred after            
                                                                       cancellation. server/sandbox.ts:95; commit’s scripts/ 
                                                                       eval-sandbox.mjs:205–208.                             
   Camera glide wait; configurable ports                    Fixed      Explicit glide state is exposed and polled; both      
                                                                       ports accept environment overrides. src/render/       
                                                                       scene.ts:607; commit’s scripts/eval-                  
                                                                       sandbox.mjs:11,146.                                   
  New defects introduced, worst first:                                                                                       
  1. Medium: restart forces an immediate storm on older islands. simMs is restored, but storm and nextStorm are not. After   
     ten simulated minutes, every restart puts the clock beyond the newly initialized storm deadline, triggering a fresh     
     storm and tripling unsheltered drain. Reproduced with a one-hour save. server/sandbox.ts:113, server/sandbox.ts:117.    
  2. Medium: the new restart test can pass on historical recovery. It searches the entire SSE payload for “wakes on the south
     shore.” The initial hello includes saved history, so an earlier wake—or another agent’s wake—passes without agent 7     
     recovering. server/sandbox.ts:712; commit’s scripts/eval-sandbox.mjs:248–256.                                           
  An unrelated working-tree edit appeared in the eval script during review; the findings above refer to the requested commit.
  Ready for the owner's supervised first play test: no; reject the remaining ambiguous predictions, normalize every clockless
  legacy recovery deadline, preserve or rebase the storm schedule, and verify restart recovery using a fresh event for the   
  targeted agent.                                                                                                            
                                                                          
```
