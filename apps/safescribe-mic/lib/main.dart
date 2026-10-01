import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:app_links/app_links.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:uuid/uuid.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:safescribe_mic/config.dart';

const kTeal = Color(kBrandTealValue);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SafeScribeMicApp());
}

Future<http.Response> _httpGet(
  Uri uri, {
  Map<String, String>? headers,
  Duration? timeout,
}) {
  return http
      .get(uri, headers: headers)
      .timeout(timeout ?? kHttpTimeout);
}

Future<http.Response> _httpPost(
  Uri uri, {
  Map<String, String>? headers,
  Object? body,
  Duration? timeout,
}) {
  return http
      .post(uri, headers: headers, body: body)
      .timeout(timeout ?? kHttpTimeout);
}

class SafeScribeMicApp extends StatelessWidget {
  const SafeScribeMicApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: kAppName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: kTeal,
          primary: kTeal,
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        fontFamily: 'Roboto',
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: kTeal,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
      home: const MicHomePage(),
    );
  }
}

class MicHomePage extends StatefulWidget {
  const MicHomePage({super.key});

  @override
  State<MicHomePage> createState() => _MicHomePageState();
}

enum _Phase { idle, claiming, ready, recording, paused, done, error }

class _MicHomePageState extends State<MicHomePage> {
  final _storage = const FlutterSecureStorage();
  final _recorder = AudioRecorder();
  final _speech = SpeechToText();
  final _uuid = const Uuid();
  final _appLinks = AppLinks();

  _Phase _phase = _Phase.idle;
  String? _error;
  String? _sessionToken;
  String? _micSessionId;
  int _stateVersion = 0;
  String _state = 'WAITING';
  bool _consent = false;
  bool _micOk = false;
  String _livePreview = '';
  String _uploadStatus = 'Idle';
  String _sourceLanguage = 'auto';
  bool _translateToEnglish = false;
  String? _speechLocaleId;
  int _elapsed = 0;
  int _segment = 0;
  int _sequence = 0;
  Timer? _heartbeat;
  Timer? _ticker;
  Timer? _partTimer;
  StreamSubscription? _linkSub;
  String? _pairTokenPending;

  @override
  void initState() {
    super.initState();
    _initLinks();
    _tryResume();
  }

  Future<void> _initLinks() async {
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _handleUri(initial);
      _linkSub = _appLinks.uriLinkStream.listen(_handleUri);
    } catch (_) {}
  }

  void _handleUri(Uri uri) {
    // https://host/mic/<token> or safescribe-mic://pair?token=
    String? token;
    if (uri.pathSegments.contains('mic') && uri.pathSegments.isNotEmpty) {
      final idx = uri.pathSegments.indexOf('mic');
      if (idx >= 0 && idx + 1 < uri.pathSegments.length) {
        token = uri.pathSegments[idx + 1];
      }
    }
    token ??= uri.queryParameters['token'];
    if (token != null && token.isNotEmpty) {
      setState(() => _pairTokenPending = token);
      _claim(token);
    }
  }

  Future<void> _tryResume() async {
    final token = await _storage.read(key: 'mic_session_token');
    final sessionId = await _storage.read(key: 'mic_session_id');
    if (token == null || sessionId == null) return;
    try {
      final res = await _httpGet(
        Uri.parse('$kApiBase/api/v1/mic/sessions/$sessionId'),
        headers: {'Authorization': 'Bearer mic_$token'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        setState(() {
          _sessionToken = token;
          _micSessionId = sessionId;
          _stateVersion = data['stateVersion'] as int? ?? 0;
          _state = data['state'] as String? ?? 'READY';
          _sourceLanguage = data['sourceLanguage'] as String? ?? 'auto';
          _translateToEnglish = data['translateToEnglish'] as bool? ?? false;
          _speechLocaleId = data['speechLocaleId'] as String?;
          _phase = _mapPhase(_state);
        });
        _startHeartbeat();
      } else {
        await _storage.deleteAll();
      }
    } catch (_) {}
  }

  _Phase _mapPhase(String state) {
    switch (state) {
      case 'RECORDING':
        return _Phase.recording;
      case 'PAUSED':
        return _Phase.paused;
      case 'FINALIZING':
      case 'TRANSCRIBING':
      case 'TRANSCRIPT_READY':
      case 'COMPLETED':
        return _Phase.done;
      case 'READY':
      case 'CLAIMED':
      case 'CONSENT_REQUIRED':
        return _Phase.ready;
      default:
        return _Phase.ready;
    }
  }

  Future<void> _claim(String pairToken) async {
    setState(() {
      _phase = _Phase.claiming;
      _error = null;
    });
    try {
      final res = await _httpPost(
        Uri.parse('$kApiBase/api/v1/mic/pairings/claim'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'pairToken': pairToken}),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode >= 400) {
        final msg = data is Map
            ? (data['error']?['message'] ?? data['message'] ?? 'Link inactive')
            : 'Link inactive';
        throw Exception(msg is List ? msg.join(', ') : msg.toString());
      }
      final map = data as Map<String, dynamic>;
      final token = map['sessionToken'] as String;
      final sessionId = map['micSessionId'] as String;
      await _storage.write(key: 'mic_session_token', value: token);
      await _storage.write(key: 'mic_session_id', value: sessionId);
      setState(() {
        _sessionToken = token;
        _micSessionId = sessionId;
        _stateVersion = map['stateVersion'] as int? ?? 0;
        _state = map['state'] as String? ?? 'CLAIMED';
        _sourceLanguage = map['sourceLanguage'] as String? ?? 'auto';
        _translateToEnglish = map['translateToEnglish'] as bool? ?? false;
        _speechLocaleId = map['speechLocaleId'] as String?;
        _phase = _Phase.ready;
      });
      _startHeartbeat();
    } catch (e) {
      setState(() {
        _phase = _Phase.error;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _startHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(kHeartbeatInterval, (_) async {
      if (_sessionToken == null || _micSessionId == null) return;
      try {
        await _httpPost(
          Uri.parse('$kApiBase/api/v1/mic/sessions/$_micSessionId/heartbeat'),
          headers: {
            'Authorization': 'Bearer mic_$_sessionToken',
            'Content-Type': 'application/json',
          },
          body: '{}',
        );
      } catch (_) {}
    });
  }

  Future<Map<String, dynamic>?> _command(String command) async {
    if (_sessionToken == null || _micSessionId == null) return null;
    final res = await _httpPost(
      Uri.parse('$kApiBase/api/v1/mic/sessions/$_micSessionId/commands'),
      headers: {
        'Authorization': 'Bearer mic_$_sessionToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'command': command,
        'expectedStateVersion': _stateVersion,
        'idempotencyKey': _uuid.v4(),
      }),
    );
    if (res.statusCode >= 400) {
      final data = jsonDecode(res.body);
      setState(() {
        _error = data is Map
            ? (data['error']?['message']?.toString() ?? 'Command failed')
            : 'Command failed';
      });
      return null;
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    setState(() {
      _stateVersion = data['stateVersion'] as int? ?? _stateVersion;
      _state = data['state'] as String? ?? _state;
    });
    return data;
  }

  Future<void> _enableMic() async {
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      setState(() => _error = 'Microphone access is off. Allow access in settings.');
      return;
    }
    setState(() => _micOk = true);
    if (_sessionToken != null) {
      await _command('MIC_READY');
    }
  }

  Future<void> _attestAndStart() async {
    if (!_consent || !_micOk) return;
    // Consent
    final consentRes = await _httpPost(
      Uri.parse('$kApiBase/api/v1/mic/sessions/$_micSessionId/consent'),
      headers: {
        'Authorization': 'Bearer mic_$_sessionToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'consentObtained': true,
        'method': 'VERBAL',
        'noticeVersion': kConsentNotice,
        'expectedStateVersion': _stateVersion,
        'idempotencyKey': _uuid.v4(),
      }),
    );
    if (consentRes.statusCode < 400) {
      final data = jsonDecode(consentRes.body) as Map<String, dynamic>;
      setState(() {
        _stateVersion = data['stateVersion'] as int? ?? _stateVersion;
        _state = data['state'] as String? ?? 'READY';
      });
    }
    final started = await _command('START');
    if (started == null) return;
    _segment = 0;
    _sequence = 0;
    _elapsed = 0;
    await WakelockPlus.enable();
    await _startRecordingLoop();
    await _startSpeechPreview();
    setState(() => _phase = _Phase.recording);
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _elapsed++);
    });
  }

  Future<void> _startSpeechPreview() async {
    final ok = await _speech.initialize();
    if (!ok) return;
    Future<void> startListen({String? localeId}) {
      return _speech.listen(
        onResult: (r) {
          setState(() => _livePreview = r.recognizedWords);
          if (_sessionToken != null && _micSessionId != null) {
            unawaited(
              _httpPost(
                Uri.parse(
                  '$kApiBase/api/v1/mic/sessions/$_micSessionId/live-preview',
                ),
                headers: {
                  'Authorization': 'Bearer mic_$_sessionToken',
                  'Content-Type': 'application/json',
                },
                body: jsonEncode({
                  'text': r.recognizedWords,
                  'isFinal': r.finalResult,
                }),
              ),
            );
          }
        },
        localeId: localeId,
        listenOptions: SpeechListenOptions(
          partialResults: true,
          listenMode: ListenMode.dictation,
        ),
      );
    }

    try {
      await startListen(localeId: _speechLocaleId);
    } catch (_) {
      await startListen();
    }
  }

  Future<void> _startRecordingLoop() async {
    if (!await _recorder.hasPermission()) return;
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/mic_s${_segment}_p0.m4a';
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 16000),
      path: path,
    );
    _partTimer?.cancel();
    _partTimer = Timer.periodic(kPartRotateInterval, (_) async {
      await _rotatePart();
    });
  }

  Future<void> _rotatePart() async {
    final path = await _recorder.stop();
    if (path != null) {
      await _uploadPart(File(path));
    }
    if (_phase == _Phase.recording) {
      final dir = await getTemporaryDirectory();
      final next = '${dir.path}/mic_s${_segment}_p$_sequence.m4a';
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 16000),
        path: next,
      );
    }
  }

  Future<void> _uploadPart(File file) async {
    if (_sessionToken == null || _micSessionId == null) return;
    setState(() => _uploadStatus = 'Uploading…');
    final bytes = await file.readAsBytes();
    final digest = sha256.convert(bytes).toString();
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('$kApiBase/api/v1/mic/sessions/$_micSessionId/parts'),
    );
    req.headers['Authorization'] = 'Bearer mic_$_sessionToken';
    req.fields['segmentNumber'] = '$_segment';
    req.fields['sequenceNumber'] = '$_sequence';
    req.fields['checksumSha256'] = digest;
    req.files.add(
      http.MultipartFile.fromBytes(
        'audio',
        bytes,
        filename: 'part-$_segment-$_sequence.m4a',
        contentType: MediaType('audio', 'mp4'),
      ),
    );
    final streamed = await req.send().timeout(kUploadTimeout);
    if (streamed.statusCode < 400) {
      setState(() {
        _uploadStatus = 'Audio protected';
        _sequence++;
      });
    } else {
      setState(() => _uploadStatus = 'Upload retry needed');
    }
    try {
      await file.delete();
    } catch (_) {}
  }

  Future<void> _pause() async {
    _partTimer?.cancel();
    await _speech.stop();
    final path = await _recorder.stop();
    if (path != null) await _uploadPart(File(path));
    await _command('PAUSE');
    setState(() => _phase = _Phase.paused);
  }

  Future<void> _resume() async {
    _segment++;
    _sequence = 0;
    await _command('RESUME');
    await _startRecordingLoop();
    await _startSpeechPreview();
    setState(() => _phase = _Phase.recording);
  }

  Future<void> _end() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('End consultation?'),
        content: const Text('End and send recording to SafeScribe desktop.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Continue')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('End and send')),
        ],
      ),
    );
    if (ok != true) return;
    _partTimer?.cancel();
    _ticker?.cancel();
    await _speech.stop();
    final path = await _recorder.stop();
    if (path != null) await _uploadPart(File(path));
    await _command('END');
    await _httpPost(
      Uri.parse('$kApiBase/api/v1/mic/sessions/$_micSessionId/complete'),
      headers: {
        'Authorization': 'Bearer mic_$_sessionToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'expectedStateVersion': _stateVersion,
        'idempotencyKey': _uuid.v4(),
        'clientMimeType': 'audio/mp4',
        'durationSeconds': _elapsed,
      }),
      timeout: kUploadTimeout,
    );
    await WakelockPlus.disable();
    await _storage.deleteAll();
    setState(() => _phase = _Phase.done);
  }

  Future<void> _disconnect() async {
    _partTimer?.cancel();
    _heartbeat?.cancel();
    _ticker?.cancel();
    await _speech.stop();
    try {
      await _recorder.stop();
    } catch (_) {}
    await _command('CANCEL');
    await _storage.deleteAll();
    await WakelockPlus.disable();
    setState(() {
      _phase = _Phase.error;
      _error =
          'Disconnected. Return to the SafeScribe desktop and generate a new QR code.';
    });
  }

  @override
  void dispose() {
    _heartbeat?.cancel();
    _ticker?.cancel();
    _partTimer?.cancel();
    _linkSub?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  String get _timerText {
    final m = (_elapsed ~/ 60).toString().padLeft(2, '0');
    final s = (_elapsed % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.asset(
                      'assets/brand/safescribe-mark.png',
                      width: 36,
                      height: 36,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.shield, color: kTeal, size: 36),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'SafeScribe',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                          height: 1.1,
                        ),
                      ),
                      Text(
                        'Mic companion',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                kAppName,
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: kTeal,
                ),
              ),
              if (kIsProdApi) ...[
                const SizedBox(height: 6),
                Text(
                  'Connected environment · production',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
              ],
              const Spacer(),
              if (_phase == _Phase.idle) _buildIdle(),
              if (_phase == _Phase.claiming) _buildClaiming(),
              if (_phase == _Phase.ready) _buildReady(),
              if (_phase == _Phase.recording || _phase == _Phase.paused)
                _buildRecording(),
              if (_phase == _Phase.done) _buildDone(),
              if (_phase == _Phase.error) _buildError(),
              const Spacer(),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.verified_user, size: 18, color: kTeal),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No patient information is stored on this phone. Audio is sent securely to SafeScribe.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'v$kAppVersionLabel',
                style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildIdle() {
    return Column(
      children: [
        Text(
          'Scan the SafeScribe Mic QR code from the desktop consultation, or open the secure link.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey.shade700),
        ),
        const SizedBox(height: 16),
        if (_pairTokenPending != null)
          FilledButton(
            onPressed: () => _claim(_pairTokenPending!),
            child: const Text('Connect'),
          ),
      ],
    );
  }

  Widget _buildClaiming() {
    return const Column(
      children: [
        CircularProgressIndicator(color: kTeal),
        SizedBox(height: 12),
        Text('Connecting securely…'),
      ],
    );
  }

  Widget _buildReady() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFFECFDF5),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: const Color(0xFFA7F3D0)),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.circle, size: 10, color: Color(0xFF10B981)),
              SizedBox(width: 8),
              Text('Securely connected', style: TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Use this phone as the microphone for the active SafeScribe consultation.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey.shade600),
        ),
        if (_translateToEnglish) ...[
          const SizedBox(height: 8),
          Text(
            _sourceLanguage == 'auto'
                ? 'Translating speech into English'
                : 'Translating $_sourceLanguage into English',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: kTeal,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ],
        const SizedBox(height: 20),
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: Colors.grey.shade300),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Before recording', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 12),
                if (!_micOk)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _enableMic,
                      icon: const Icon(Icons.mic),
                      label: const Text('Turn on microphone'),
                    ),
                  )
                else
                  const Text('Microphone ready', style: TextStyle(color: Color(0xFF047857))),
                const SizedBox(height: 12),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _consent,
                  onChanged: (v) => setState(() => _consent = v ?? false),
                  title: const Text(
                    'I have explained transcription and the patient has agreed.',
                    style: TextStyle(fontSize: 14),
                  ),
                  subtitle: Text(
                    'Declining transcription will not affect care.',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton.icon(
            onPressed: (_consent && _micOk) ? _attestAndStart : null,
            icon: const Icon(Icons.mic),
            label: const Text('Start consultation'),
          ),
        ),
        TextButton(onPressed: _disconnect, child: const Text('Disconnect')),
      ],
    );
  }

  Widget _buildRecording() {
    final recording = _phase == _Phase.recording;
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (recording)
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
              ),
            const SizedBox(width: 8),
            Text(
              recording ? 'Recording' : 'Paused',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(_timerText, style: const TextStyle(fontSize: 40, fontFeatures: [FontFeature.tabularFigures()])),
        const SizedBox(height: 8),
        Text(_uploadStatus, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        if (_livePreview.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Text(_livePreview, style: TextStyle(color: Colors.grey.shade700)),
          ),
        ],
        const SizedBox(height: 8),
        Text(
          'Keep SafeScribe Mic open and your screen unlocked.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: recording ? _pause : _resume,
                icon: Icon(recording ? Icons.pause : Icons.play_arrow),
                label: Text(recording ? 'Pause' : 'Resume'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.tonalIcon(
                style: FilledButton.styleFrom(foregroundColor: Colors.red.shade800),
                onPressed: _end,
                icon: const Icon(Icons.stop),
                label: const Text('End'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildDone() {
    return Column(
      children: [
        Icon(Icons.check_circle, size: 64, color: Colors.green.shade600),
        const SizedBox(height: 12),
        const Text('Recording sent', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(
          'Continue on the SafeScribe desktop.',
          style: TextStyle(color: Colors.grey.shade600),
        ),
      ],
    );
  }

  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Text(
        _error ??
            'This SafeScribe Mic link is no longer active. Return to the SafeScribe desktop and generate a new QR code.',
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 15),
      ),
    );
  }
}
