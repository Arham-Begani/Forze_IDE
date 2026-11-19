# Two people, 90 seconds

Use two separate browser profiles. The developer owns the room. The teammate only needs the invite. For a local recording both browsers must be on the same machine. For two devices, use the same hosted HTTPS URL.

| Time | Action | Suggested words |
| --- | --- | --- |
| 0–12 s | Developer opens the failed Orbit storefront sample. Show the error, check the missing-import diagnostic and compare the preview. | “Our deploy failed on an import. I can send just this error to someone who knows the code.” |
| 12–25 s | Create the room, get the invite, and open it in the teammate browser. Keep both windows visible. | “You can see the error immediately. You didn’t need my IDE or my Vercel account.” |
| 25–42 s | Developer sends “Can you spot the missing import?” Teammate replies “Change ./prcing.mjs to ./pricing.mjs in storefront.mjs.” | “These are two Nexconn identities. The reply arrives in my room.” |
| 42–56 s | Developer accepts the reply. Show the accepted text and “No rerun recorded.” | “We’ve agreed on a fix. The deployment still needs to prove it.” |
| 56–76 s | Change the sample import to ./pricing.mjs and click Build & deploy sample. Open the built storefront. | “This runs the same build again, this time against the file that exists.” |
| 76–90 s | Refresh the teammate’s window and show the excerpt, conversation, accepted reply and rerun result. | “Next time this fails, the error, the fix and its result are in one place.” |

**IDE recording option.** Use a disposable Vercel project whose name matches the open folder. Turn off Auto-fix for the demo, use Deploy This Folder to observe an actual failure, select the error with Ask for help, edit the import in the existing editor and use Deploy fixed folder. Click Share rerun status to send the latest Vercel observation to the owner’s browser. Only label the recording as a Vercel deployment if that path was run. The browser sample builds and publishes its own local HTML artifact.
