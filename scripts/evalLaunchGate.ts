import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Must load env before importing app code since env.ts reads process.env on load
import { generateSummaryFromInput } from '../src/services/summaryService';
import { getAIConfigSummary } from '../src/config/env';

const TEST_TRANSCRIPTS = [
  {
    name: "Clean Standard Visit",
    text: "So Dr. Smith said my blood pressure is looking great today, measuring 120 over 80. He told me to keep taking the lisinopril 10 milligrams every morning. No changes to my diet. I need to come back in six months for a standard checkup.",
  },
  {
    name: "Confusing Medication Change",
    text: "Alright, the doctor was going pretty fast. She said to stop taking the blue pill which I think is amlodipine. Or maybe she said keep taking it but cut it in half? Oh wait, she wrote it down. She said take 5 milligrams of amlodipine instead of 10. And to schedule a blood test next week to check kidney function.",
  },
  {
    name: "Off-Topic Rambling",
    text: "The parking was absolutely terrible today. Took me 20 minutes to find a spot. Then the nurse called me in. Dr. Chen finally came in. We talked about the grandkids for a bit. Oh yeah, she said all my labs look completely normal, no concerns at all. Just keep doing what I'm doing and I'll see her next year.",
  }
];

async function runLaunchGateEval() {
  console.log('=============================================');
  console.log('🚀 SPRINT 5 LAUNCH GATE: AI PIPELINE EVALUATION');
  console.log('=============================================');
  console.log('Configured Provider:', getAIConfigSummary());
  console.log('---');

  let passed = 0;
  let failed = 0;

  for (const [idx, test] of TEST_TRANSCRIPTS.entries()) {
    console.log(`\n▶ [${idx + 1}/${TEST_TRANSCRIPTS.length}] ${test.name}`);
    console.log(`Input: "${test.text.substring(0, 50)}..."`);
    
    const startTime = Date.now();
    try {
      const summaryId = `eval-${Date.now()}`;
      const result = await generateSummaryFromInput(summaryId, {
         rawText: test.text,
         language: 'en'
      });
      const duration = Date.now() - startTime;

      console.log(`⏱  Duration: ${duration}ms`);
      
      // Verify rules
      const filledSections = result.sections.filter(s => !s.isEmpty).length;
      console.log(`✅ Filled sections: ${filledSections}`);
      
      if (result.actionItems.length > 0) {
        console.log(`📝 Action items: ${result.actionItems.map(a => a.type).join(', ')}`);
      }

      if (result.flags.length > 0) {
        console.log(`⚠️  Accuracy flags: ${result.flags.length} caught`);
        result.flags.forEach(f => {
           console.log(`    - "${f.rawPhrase}" -> ${f.interpretedPhrase}`);
        });
      }

      if (result._validationWarnings && result._validationWarnings.length > 0) {
        console.log(`🚧 Validation warnings: ${result._validationWarnings.length}`);
        result._validationWarnings.forEach(w => console.log(`   - ${w}`));
      }

      // Very rudimentary pass check
      if (duration < 60000 && filledSections > 0) {
         passed++;
      } else {
         failed++;
      }
      
    } catch (err: any) {
      console.error(`❌ FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=============================================');
  console.log(`🏆 EVALUATION COMPLETE | Passed: ${passed} | Failed: ${failed}`);
  console.log('=============================================');
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Execute
runLaunchGateEval().catch(err => {
  console.error("Unhandled top-level error:", err);
  process.exit(1);
});
