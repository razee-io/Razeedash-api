The external auth modules here are exact copies of the corresponding `local` auth files, modified only to load common packages from different relative paths.
The external auth test uses the `../data/local/` test data.
The external auth helper `../testHelper.extauthtest.js` is an exact copy of the corresponding `../testHelper.local.js`, modified only to use `'extauthtest'` instead of `AUTH_MODELS.LOCAL`.

To use these files for auth, export the `EXTERNAL_AUTH_MODELS` and `AUTH_MODEL` environment variables:
```bash
export EXTERNAL_AUTH_MODELS="{ \"extauthtest\": { \"classPath\": \"$(pwd)/app/apollo/test/externalAuth/auth_local.js\", \"modelPath\": \"$(pwd)/app/apollo/test/externalAuth/user.local.schema.js\", \"initPath\": \"$(pwd)/app/apollo/test/externalAuth/init.local.js\", \"orgPath\": \"$(pwd)/app/apollo/test/externalAuth/organization.local.schema.js\" } }"

export AUTH_MODEL=extauthtest
```

Or just run the `extauthtest` command, which exports the environment variables automatically.
```
npm run test:apollo:extauthtest
```
