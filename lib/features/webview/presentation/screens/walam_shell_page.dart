import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:walam_mobile_app/features/webview/domain/walam_tab.dart';
import 'package:walam_mobile_app/features/webview/presentation/widgets/no_internet_view.dart';
import 'package:walam_mobile_app/features/webview/presentation/widgets/splash_screen.dart';

class WalamShellPage extends StatefulWidget {
  const WalamShellPage({super.key});

  @override
  State<WalamShellPage> createState() => _WalamShellPageState();
}

class _WalamShellPageState extends State<WalamShellPage> {
  static const Duration _splashDuration = Duration(milliseconds: 1700);
  static const Duration _loadingWatchdogDuration = Duration(seconds: 18);
  static const String _mobileUserAgent =
      'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

  late final List<_TabSession> _tabs = WalamTab.values
      .map(_createTabSession)
      .toList();

  int _currentIndex = 0;
  bool _showSplash = true;

  _TabSession get _currentTab => _tabs[_currentIndex];

  @override
  void initState() {
    super.initState();
    unawaited(_dismissSplash());
    unawaited(_loadTab(_tabs.first));
  }

  Future<void> _dismissSplash() async {
    await Future<void>.delayed(_splashDuration);
    if (!mounted) {
      return;
    }
    setState(() {
      _showSplash = false;
    });
  }

  _TabSession _createTabSession(WalamTab tab) {
    final WebViewController controller = WebViewController();
    final _TabSession session = _TabSession(tab: tab, controller: controller);

    if (controller.platform is AndroidWebViewController) {
      final AndroidWebViewController androidController =
          controller.platform as AndroidWebViewController;
      AndroidWebViewController.enableDebugging(true);
      unawaited(androidController.setMediaPlaybackRequiresUserGesture(false));
      unawaited(
        androidController.setMixedContentMode(MixedContentMode.alwaysAllow),
      );
    }

    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFFFFFFF))
      ..setUserAgent(_mobileUserAgent)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (_) => NavigationDecision.navigate,
          onPageStarted: (_) {
            if (!mounted) {
              return;
            }
            setState(() {
              session.isLoading = true;
              session.progress = 0;
              session.showSlowLoadHint = false;
              session.showOfflineScreen = false;
              session.errorMessage = null;
            });
            _startLoadingWatchdog(session);
          },
          onProgress: (int progress) {
            if (!mounted) {
              return;
            }
            setState(() {
              session.progress = progress;
            });
          },
          onPageFinished: (_) {
            if (!mounted) {
              return;
            }
            _stopLoadingWatchdog(session);
            setState(() {
              session.isLoading = false;
              session.progress = 100;
              session.showSlowLoadHint = false;
            });
            unawaited(_applyMobileViewport(session));
          },
          onWebResourceError: (WebResourceError error) {
            if (error.isForMainFrame != true || !mounted) {
              return;
            }
            _stopLoadingWatchdog(session);

            final bool connectivityIssue = _looksLikeConnectivityIssue(error);
            final String fallbackMessage = connectivityIssue
                ? 'پەیوەندی ئینتەرنێتت بپشکنە و دووبارە هەوڵبدەوە.'
                : 'کێشەیەک لە بارکردنی ئەم پەڕەیەدا ڕوویدا.';

            setState(() {
              session.isLoading = false;
              session.progress = 0;
              session.showOfflineScreen = connectivityIssue;
              session.showSlowLoadHint = false;
              session.errorMessage = fallbackMessage;
            });

            if (!connectivityIssue &&
                !_showSplash &&
                identical(session, _currentTab)) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'بارکردنی پەڕەکە سەرکەوتوو نەبوو. تکایە دووبارە هەوڵبدەوە.',
                  ),
                ),
              );
            }
          },
        ),
      );
    return session;
  }

  Future<void> _applyMobileViewport(_TabSession session) async {
    try {
      await session.controller.runJavaScript('''
(() => {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0';
  document.documentElement.style.maxWidth = '100%';
  document.body.style.maxWidth = '100%';
  document.body.style.overflowX = 'hidden';
})();
''');
    } catch (_) {
      // Some pages block script injection; ignore and continue loading.
    }
  }

  void _startLoadingWatchdog(_TabSession session) {
    _stopLoadingWatchdog(session);
    session.loadingWatchdog = Timer(_loadingWatchdogDuration, () {
      if (!mounted || !session.isLoading) {
        return;
      }
      setState(() {
        session.showSlowLoadHint = true;
      });
    });
  }

  void _stopLoadingWatchdog(_TabSession session) {
    session.loadingWatchdog?.cancel();
    session.loadingWatchdog = null;
  }

  bool _looksLikeConnectivityIssue(WebResourceError error) {
    final String description = error.description.toLowerCase();
    return description.contains('internet') ||
        description.contains('network') ||
        description.contains('timeout') ||
        description.contains('timed out') ||
        description.contains('connection') ||
        description.contains('host') ||
        description.contains('dns') ||
        description.contains('offline') ||
        description.contains('net::err');
  }

  Future<void> _loadTab(_TabSession session, {bool force = false}) async {
    if (session.hasLoadedOnce && !force) {
      return;
    }

    if (mounted) {
      setState(() {
        session.hasLoadedOnce = true;
        session.isLoading = true;
        session.progress = 0;
        session.showSlowLoadHint = false;
        session.showOfflineScreen = false;
        session.errorMessage = null;
      });
    } else {
      session
        ..hasLoadedOnce = true
        ..isLoading = true
        ..progress = 0
        ..showSlowLoadHint = false
        ..showOfflineScreen = false
        ..errorMessage = null;
    }
    _startLoadingWatchdog(session);

    await session.controller.loadRequest(session.tab.url);
  }

  Future<void> _refreshCurrentTab() async {
    final _TabSession session = _currentTab;

    if (!session.hasLoadedOnce) {
      await _loadTab(session);
      return;
    }

    setState(() {
      session.isLoading = true;
      session.progress = 0;
      session.showSlowLoadHint = false;
      session.showOfflineScreen = false;
      session.errorMessage = null;
    });
    _startLoadingWatchdog(session);

    await session.controller.reload();
  }

  Future<void> _handleBackNavigation() async {
    final _TabSession session = _currentTab;

    if (await session.controller.canGoBack()) {
      await session.controller.goBack();
      return;
    }

    if (_currentIndex != 0) {
      setState(() {
        _currentIndex = 0;
      });
      await _loadTab(_tabs.first);
      return;
    }

    await SystemNavigator.pop();
  }

  void _handleDestinationSelected(int index) {
    if (index == _currentIndex) {
      unawaited(_refreshCurrentTab());
      return;
    }

    setState(() {
      _currentIndex = index;
    });
    unawaited(_loadTab(_tabs[index]));
  }

  Widget _buildBody() {
    if (_showSplash) {
      return const WalamSplashScreen(key: ValueKey('splash'));
    }

    return Stack(
      key: const ValueKey('shell'),
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: const BoxDecoration(color: Color(0xFFF4F7F6)),
          child: _buildWebView(_currentTab),
        ),
        if (_currentTab.showOfflineScreen)
          Positioned.fill(
            child: NoInternetView(
              onRetry: () => unawaited(_loadTab(_currentTab, force: true)),
              message:
                  _currentTab.errorMessage ??
                  'پەیوەندی ئینتەرنێتت بپشکنە و دووبارە هەوڵبدەوە.',
            ),
          ),
        if (_currentTab.isLoading && !_currentTab.showOfflineScreen)
          const Align(
            alignment: Alignment.center,
            child: SizedBox(
              width: 34,
              height: 34,
              child: CircularProgressIndicator(strokeWidth: 3),
            ),
          ),
        if (_currentTab.isLoading)
          Align(
            alignment: Alignment.topCenter,
            child: LinearProgressIndicator(
              minHeight: 3,
              value: _currentTab.progress > 0 && _currentTab.progress < 100
                  ? _currentTab.progress / 100
                  : null,
            ),
          ),
        if (_currentTab.showSlowLoadHint && !_currentTab.showOfflineScreen)
          Positioned(
            left: 12,
            right: 12,
            bottom: 14,
            child: Material(
              color: const Color(0xFF10211F),
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'بارکردنی پەڕەکە زیاتر لە ئاسایی کاتی دەوێت.',
                        style: TextStyle(color: Colors.white),
                      ),
                    ),
                    TextButton(
                      onPressed: () => unawaited(_refreshCurrentTab()),
                      child: const Text('دووبارە'),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildWebView(_TabSession session) {
    if (session.controller.platform is AndroidWebViewController) {
      final AndroidWebViewWidgetCreationParams params =
          AndroidWebViewWidgetCreationParams(
            controller: session.controller.platform as AndroidWebViewController,
            displayWithHybridComposition: true,
          );
      return WebViewWidget.fromPlatformCreationParams(
        key: ValueKey('webview-${session.tab.name}'),
        params: params,
      );
    }

    return WebViewWidget(
      key: ValueKey('webview-${session.tab.name}'),
      controller: session.controller,
    );
  }

  @override
  void dispose() {
    for (final _TabSession session in _tabs) {
      session.loadingWatchdog?.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) async {
        if (didPop) {
          return;
        }
        await _handleBackNavigation();
      },
      child: Scaffold(
        appBar: _showSplash
            ? null
            : AppBar(
                title: const Text('Walam'),
                actions: [
                  IconButton(
                    onPressed: () => unawaited(_refreshCurrentTab()),
                    tooltip: 'نوێکردنەوە',
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
        body: AnimatedSwitcher(
          duration: const Duration(milliseconds: 420),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          child: _buildBody(),
        ),
        bottomNavigationBar: _showSplash
            ? null
            : NavigationBar(
                selectedIndex: _currentIndex,
                onDestinationSelected: _handleDestinationSelected,
                destinations: [
                  for (final WalamTab tab in WalamTab.values)
                    NavigationDestination(
                      icon: Icon(tab.icon),
                      label: tab.label,
                    ),
                ],
              ),
      ),
    );
  }
}

class _TabSession {
  _TabSession({required this.tab, required this.controller});

  final WalamTab tab;
  final WebViewController controller;

  bool hasLoadedOnce = false;
  bool isLoading = false;
  int progress = 0;
  bool showOfflineScreen = false;
  bool showSlowLoadHint = false;
  String? errorMessage;
  Timer? loadingWatchdog;
}
