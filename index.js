const core = require('@actions/core');
const exec = require('@actions/exec');
const AWS = require('aws-sdk');
const fs = require('graceful-fs');

async function run () {

  try {
    const s3Bucket = core.getInput('s3-bucket', { required: true });
    const cacheKey = core.getInput('cache-key', { required: true });
    const paths = core.getInput('paths', { required: true });
    const command = core.getInput('command', { required: true });
    const zipOption = core.getInput('zip-option', { required: false });
    const unzipOption = core.getInput('unzip-option', { required: false });
    const workingDirectory = core.getInput('working-directory', { required: false });
    const fileName = cacheKey + '.zip';

    const restoreKeys = core
      .getInput('restore-keys', { required: false })
      .split('\n')
      .map(s => s.trim())
      .filter(x => x !== '');

    process.chdir(workingDirectory);

    const s3 = new AWS.S3();

    s3.getObject({
        Bucket: s3Bucket,
        Key: fileName
      }, async (err, data) => {
        if (err) {
          console.log(`No cache is found for key: ${fileName}`);

          const matchedRestoreKey = restoreKeys.find(async (key) => {
            const data = await s3.listObjectsV2({
              Bucket: s3Bucket,
              prefix: key
            }).promise();

            if (data.Contents.length) {
              return data.Contents.sort((a, b) => b.valueOf() - a.valueOf()).Key;
            }
          })

          if (matchedRestoreKey) {
            const data = await s3.getObject({
              Bucket: s3Bucket,
              Key: matchedRestoreKey
            });

            await restoreCache(matchedRestoreKey, data, unzipOption)
          }

          await exec.exec(command); // install or build command e.g. npm ci, npm run dev
          await exec.exec(`zip ${zipOption} ${fileName} ${paths}`);

          s3.upload({
              Body: fs.readFileSync(fileName),
              Bucket: s3Bucket,
              Key: fileName,
            }, (err, data) => {
              if (err) {
                console.log(`Failed store to ${fileName}`);
              } else {
                console.log(`Stored cache to ${fileName}`);
              }
            }
          );

        } else {
          await restoreCache(fileName, data, unzipOption);
        }
    });

  } catch (error) {
    core.setFailed(error.message);
  }
}

async function restoreCache (fileName, data, unzipOption) {
  console.log(`Found a cache for key: ${fileName}`);
  fs.writeFileSync(fileName, data.Body);

  await exec.exec(`unzip ${unzipOption} ${fileName}`);
  await exec.exec(`rm -f ${fileName}`);
}

run();
