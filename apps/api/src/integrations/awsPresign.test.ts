import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presignAws } from './aws.js';

// Amazon S3 documentation, "Authenticating Requests: Using Query Parameters (AWS Signature
// Version 4)", example: GET examplebucket/test.txt, valid for 86400 seconds.
test('presigned URL matches the documented S3 example', () => {
  const url = presignAws({
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    region: 'us-east-1',
    service: 's3',
    credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    expiresSeconds: 86400,
    now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(
    url,
    'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
  );
});

test('presigned URL signs the extra headers and refuses a long lifetime', () => {
  const url = new URL(presignAws({
    method: 'PUT',
    url: 'https://b.s3.ap-south-1.amazonaws.com/k.zip',
    region: 'ap-south-1',
    service: 's3',
    credentials: { accessKeyId: 'AKID', secretAccessKey: 's', sessionToken: 'tok' },
    expiresSeconds: 900,
    headers: { 'x-amz-checksum-sha256': 'abc=', 'Content-Length': '10' },
  }));
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;host;x-amz-checksum-sha256');
  assert.equal(url.searchParams.get('X-Amz-Security-Token'), 'tok');
  assert.match(url.searchParams.get('X-Amz-Signature')!, /^[0-9a-f]{64}$/);
  assert.throws(() => presignAws({ method: 'GET', url: 'https://b.s3.ap-south-1.amazonaws.com/k', region: 'ap-south-1', service: 's3', credentials: { accessKeyId: 'a', secretAccessKey: 'b' }, expiresSeconds: 700000 }));
});
