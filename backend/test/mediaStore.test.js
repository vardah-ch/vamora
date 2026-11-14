'use strict';
// Database-backed media storage, used on hosts without a persistent disk.
// Must be set before the app (and upload middleware) is loaded.
process.env.MEDIA_STORE = 'db';

const fs = require('fs');
const path = require('path');
const { app, db, request, makePatient, makeCaregiver, auth, PNG_1PX } = require('./helpers');
const { PHOTO_DIR } = require('../src/middlewares/upload');

describe('MEDIA_STORE=db', () => {
  let pat, outsider, photoUrl, photo;

  beforeAll(async () => {
    pat = await makePatient('Blob Patient');
    outsider = await makeCaregiver('Blob Outsider');
    const up = await request(app).post('/api/v1/photos').set(auth(pat.token))
      .field('caption', 'Garden with Nadia').field('category', 'family')
      .attach('photo', PNG_1PX, { filename: 'garden.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    photoUrl = up.body.photo.url;
    photo = await db.Photo.findOne({ where: { patientId: pat.user.id } });
  });

  test('the file bytes are stored in the database, not left on disk', async () => {
    const [row] = await db.sequelize.query('SELECT mime, length(data) AS n FROM media_blobs WHERE name = :n',
      { replacements: { n: photo.filename }, type: db.sequelize.QueryTypes.SELECT });
    expect(row.mime).toBe('image/png');
    expect(Number(row.n)).toBe(PNG_1PX.length);
    expect(fs.existsSync(path.join(PHOTO_DIR, photo.filename))).toBe(false);
  });

  test('the owner gets the exact bytes back through the signed URL', async () => {
    const res = await request(app).get(photoUrl).buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(Buffer.compare(res.body, PNG_1PX)).toBe(0);
  });

  test('access control still applies: a signed URL re-targeted to another user is refused', async () => {
    const tampered = photoUrl.replace(/u=\d+/, `u=${outsider.user.id}`);
    expect((await request(app).get(tampered)).status).not.toBe(200);
  });
});
