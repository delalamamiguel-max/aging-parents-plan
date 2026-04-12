import { parseLLMResponse, validateLLMOutput, RawLLMOutput } from '../../src/services/outputValidator';

describe('Output Validator', () => {
  describe('parseLLMResponse', () => {
    it('successfully parses clean JSON', () => {
      const raw = '{"sections": {}, "actionItems": [], "flags": []}';
      const parsed = parseLLMResponse(raw);
      expect(parsed).not.toBeNull();
      expect(parsed?.actionItems).toEqual([]);
    });

    it('strips markdown code blocks', () => {
      const raw = '```json\n{"sections": {}, "actionItems": [], "flags": []}\n```';
      const parsed = parseLLMResponse(raw);
      expect(parsed).not.toBeNull();
    });

    it('extracts JSON from surrounding text', () => {
      const raw = 'Here is the result: {"sections": {}, "actionItems": [], "flags": []} Hope it helps!';
      const parsed = parseLLMResponse(raw);
      expect(parsed).not.toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const raw = 'This is not JSON';
      const parsed = parseLLMResponse(raw);
      expect(parsed).toBeNull();
    });
  });

  describe('validateLLMOutput', () => {
    const validOutput: RawLLMOutput = {
      sections: {
        visit_date_provider: '2026-04-12 with Dr. Smith',
        what_happened: 'Discussed medication changes.',
      },
      actionItems: [
        {
          type: 'medication',
          content: 'Take 5mg of Lisinopril',
          isFlagged: false,
          dueDate: '2026-04-13',
          dueDateRaw: null,
        },
      ],
      flags: [],
    };

    const rawInput = 'Patient visit notes...';
    const visitDate = '2026-04-12';

    it('validates a correct payload', () => {
      const result = validateLLMOutput(validOutput, rawInput, visitDate);
      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('rejects if sections field is missing', () => {
      const invalid = { ...validOutput, sections: undefined as any };
      const result = validateLLMOutput(invalid, rawInput, visitDate);
      expect(result.isValid).toBe(false);
      expect(result.violations).toContain('sections field missing or not an object');
    });

    it('truncates overly long sections', () => {
      const longText = 'A'.repeat(700);
      const outputWithLongSection: RawLLMOutput = {
        ...validOutput,
        sections: { ...validOutput.sections, what_happened: longText },
      };
      
      const result = validateLLMOutput(outputWithLongSection, rawInput, visitDate);
      expect(result.sanitisedOutput?.sections.what_happened).toHaveLength(600);
      expect(result.violations).toContain('Section what_happened was truncated (too long)');
    });

    it('skips action items with invalid types', () => {
      const invalidItem = {
        type: 'invalid_type' as any,
        content: 'Something',
        isFlagged: false,
        dueDate: null,
        dueDateRaw: null,
      };
      const outputWithInvalidItem: RawLLMOutput = {
        ...validOutput,
        actionItems: [invalidItem],
      };

      const result = validateLLMOutput(outputWithInvalidItem, rawInput, visitDate);
      expect(result.isValid).toBe(false);
      expect(result.sanitisedOutput?.actionItems).toHaveLength(0);
      expect(result.violations).toContain('Invalid action item type: invalid_type');
    });

    it('resolves relative dates in action items', () => {
      const relativeItem = {
        type: 'follow_up',
        content: 'Follow up in 1 week',
        isFlagged: false,
        dueDate: null,
        dueDateRaw: '1 week',
      };
      const output: RawLLMOutput = {
        ...validOutput,
        actionItems: [relativeItem],
      };

      const result = validateLLMOutput(output, rawInput, visitDate);
      // Assuming resolveRelativeDate('1 week', '2026-04-12') returns '2026-04-19'
      expect(result.sanitisedOutput?.actionItems[0].dueDate).toBe('2026-04-19');
    });
  });
});
