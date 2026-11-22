import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indiaRegion, signAws } from './aws.js';

// AWS Signature Version 4 test suite, "get-vanilla" (docs.aws.amazon.com, sigv4 examples).
test('SigV4 matches the AWS test suite', () => {
  const h = signAws({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    region: 'us-east-1',
    service: 'service',
    credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' },
    now: new Date('2015-08-30T12:36:00Z'),
  });
  assert.equal(h['x-amz-date'], '20150830T123600Z');
  assert.equal(
    h.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  );
});

test('only India regions are accepted', () => {
  assert.equal(indiaRegion('ap-south-1'), 'ap-south-1');
  assert.equal(indiaRegion('ap-south-2'), 'ap-south-2');
  assert.equal(indiaRegion('us-east-1'), null);
  assert.equal(indiaRegion(undefined), null);
});
