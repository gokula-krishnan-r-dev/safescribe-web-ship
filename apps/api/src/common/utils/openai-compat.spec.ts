import {
  isUnsupportedTemperatureError,
  supportsSamplingTemperature,
  withOptionalTemperature,
} from './openai-compat';

describe('openai-compat', () => {
  describe('supportsSamplingTemperature', () => {
    it('rejects gpt-5 family and o-series', () => {
      expect(supportsSamplingTemperature('gpt-5.6-terra')).toBe(false);
      expect(supportsSamplingTemperature('gpt-5.4')).toBe(false);
      expect(supportsSamplingTemperature('o1-mini')).toBe(false);
      expect(supportsSamplingTemperature('o3')).toBe(false);
    });

    it('allows classic chat models', () => {
      expect(supportsSamplingTemperature('gpt-4.1-mini')).toBe(true);
      expect(supportsSamplingTemperature('gpt-4o')).toBe(true);
    });
  });

  describe('withOptionalTemperature', () => {
    it('omits temperature for gpt-5', () => {
      const params = withOptionalTemperature(
        {
          model: 'gpt-5.6-terra',
          messages: [{ role: 'user', content: 'hi' }],
        },
        0.25,
      );
      expect(params.temperature).toBeUndefined();
    });

    it('keeps temperature for gpt-4.1', () => {
      const params = withOptionalTemperature(
        {
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: 'hi' }],
        },
        0.25,
      );
      expect(params.temperature).toBe(0.25);
    });
  });

  describe('isUnsupportedTemperatureError', () => {
    it('detects OpenAI 400 wording', () => {
      expect(
        isUnsupportedTemperatureError(
          new Error(
            "400 Unsupported value: 'temperature' does not support 0.25 with this model. Only the default (1) value is supported.",
          ),
        ),
      ).toBe(true);
      expect(isUnsupportedTemperatureError(new Error('rate limit'))).toBe(false);
    });
  });
});
