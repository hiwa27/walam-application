import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:walam_mobile_app/features/webview/presentation/widgets/splash_screen.dart';

void main() {
  testWidgets('Walam splash screen shows Kurdish onboarding text', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: WalamSplashScreen(enableVideoPlayback: false)),
      ),
    );

    expect(find.text('Walam'), findsOneWidget);
    expect(find.text('بە یەک کرتە، دەستت دەگات بە Walam.'), findsOneWidget);
    expect(
      find.text('ئەزموونی پارێزراوی WebView بۆ walam.app'),
      findsOneWidget,
    );
  });
}
