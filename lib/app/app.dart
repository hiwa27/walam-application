import 'package:flutter/material.dart';
import 'package:walam_mobile_app/core/theme/app_theme.dart';
import 'package:walam_mobile_app/features/webview/presentation/screens/walam_shell_page.dart';

class WalamApp extends StatelessWidget {
  const WalamApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'walam app',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const WalamShellPage(),
    );
  }
}
