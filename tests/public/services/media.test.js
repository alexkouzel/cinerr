import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Media from '../../../public/shared/scripts/services/media.js';

describe('Media._parseCSV', () => {
    test('parses RFC 4180 quoting: quoted commas, escaped quotes, CRLF endings', () => {
        const text = 'a,b,c\r\n"hello, world","he said ""hi""",x\r\n';
        assert.deepEqual(Media._parseCSV(text), [
            { a: 'hello, world', b: 'he said "hi"', c: 'x' },
        ]);
    });

    test('handles structural edges: short final row, trailing blank line, empty input', () => {
        assert.deepEqual(Media._parseCSV('a,b,c\n1,2,3\n4,5'), [
            { a: '1', b: '2', c: '3' },
            { a: '4', b: '5', c: '' },
        ]);
        assert.deepEqual(Media._parseCSV('a,b\n1,2\n\n'), [{ a: '1', b: '2' }]);
        assert.deepEqual(Media._parseCSV(''), []);
    });
});
