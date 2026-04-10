Put your signing files here:

1. walam_app_unsigned.ipa
2. walam_app.mobileprovision
3. walam_app.p12

Use this helper command from project root (PowerShell):

`.\scripts\prepare_app_testers_inputs.ps1 -IpaPath "C:\path\to\file.ipa" -ProvisionPath "C:\path\to\file.mobileprovision" -P12Path "C:\path\to\file.p12"`

Bundle Identifier for provisioning profile must be:

`com.walam.walamMobileApp`
