import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:walam_mobile_app/features/webview/presentation/widgets/splash_screen.dart';

void main() {
  testWidgets('Walam splash screen shows the brand name', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: WalamSplashScreen())),
    );

    expect(find.text('Walam'), findsOneWidget);
    expect(find.text('Marketplace access in one tap.'), findsOneWidget);
  });
}
