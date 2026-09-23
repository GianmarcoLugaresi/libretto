import Foundation
import UIKit
import WebKit
import Capacitor

/// Sincronizzazione Infostud: le pagine ufficiali in una WKWebView con
/// sessione usa-e-getta. Il lato JavaScript è src/lib/infostud/webview.ts.
///
/// Garanzie, in ordine d'importanza:
/// - l'archivio della WebView è non persistente: cookie, cache e storage
///   vivono solo in memoria, e a fine sessione si svuotano comunque;
/// - lo script dell'app si esegue solo a pagina caricata su un host
///   consentito, mai sulle pagine del fornitore SPID o CIE;
/// - dalla pagina si accettano messaggi solo dal frame principale di un
///   host consentito;
/// - in alto si vede sempre il dominio su cui si trova lo studente.
@objc(InfostudWebViewPlugin)
public class InfostudWebViewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InfostudWebViewPlugin"
    public let jsName = "InfostudWebView"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "estrai", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "annulla", returnType: CAPPluginReturnPromise)
    ]

    private var sessione: SessioneInfostud?

    @objc func estrai(_ call: CAPPluginCall) {
        guard let testo = call.getString("url"), let url = URL(string: testo),
              let script = call.getString("script") else {
            call.reject("Parametri mancanti", "PARAMETRI")
            return
        }
        let consentiti = Set((call.getArray("hostConsentiti") as? [String]) ?? [])
        // Solo https. L'unica eccezione è localhost, per le prove sul
        // simulatore contro l'Infostud finto del server di sviluppo.
        let locale = url.host == "localhost"
        guard url.scheme == "https" || (locale && url.scheme == "http"), !consentiti.isEmpty else {
            call.reject("Indirizzo non consentito", "PARAMETRI")
            return
        }
        let timeout = (call.getDouble("timeoutMs") ?? 300_000) / 1000

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if self.sessione != nil {
                call.reject("Una sincronizzazione è già in corso", "IN_CORSO")
                return
            }
            let s = SessioneInfostud(url: url, consentiti: consentiti, script: script, timeout: timeout)
            s.fase = { [weak self] f in self?.notifyListeners("fase", data: ["fase": f]) }
            s.fine = { [weak self] esito in
                self?.sessione = nil
                switch esito {
                case .dati(let dati): call.resolve(dati)
                case .errore(let codice, let messaggio): call.reject(messaggio, codice)
                }
            }
            self.sessione = s
            let nav = UINavigationController(rootViewController: s)
            nav.modalPresentationStyle = .pageSheet
            // Niente chiusura col gesto: si esce da Annulla, che chiude
            // anche la sessione.
            nav.isModalInPresentation = true
            self.bridge?.viewController?.present(nav, animated: true)
        }
    }

    @objc func annulla(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.sessione?.termina(.errore("ANNULLATA", "Sincronizzazione annullata"))
            call.resolve()
        }
    }
}

enum EsitoSessione {
    case dati([String: Any])
    case errore(String, String)
}

/// Un accesso, dall'apertura alla chiusura. Non sopravvive a sé stesso.
final class SessioneInfostud: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    static let canale = "mysapienza"

    private let url: URL
    private let consentiti: Set<String>
    private let script: String
    private let timeout: TimeInterval
    private let archivio = WKWebsiteDataStore.nonPersistent()
    private var webView: WKWebView!
    private var timer: Timer?
    private var finita = false
    private let avviso = UILabel()

    var fase: ((String) -> Void)?
    var fine: ((EsitoSessione) -> Void)?

    init(url: URL, consentiti: Set<String>, script: String, timeout: TimeInterval) {
        self.url = url
        self.consentiti = consentiti
        self.script = script
        self.timeout = timeout
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("non usato") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let conf = WKWebViewConfiguration()
        conf.websiteDataStore = archivio
        conf.userContentController.add(Debole(self), name: Self.canale)
        webView = WKWebView(frame: .zero, configuration: conf)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false

        avviso.text = "Se non succede niente, apri la sezione Esami di Infostud."
        avviso.font = .preferredFont(forTextStyle: .footnote)
        avviso.textColor = .secondaryLabel
        avviso.numberOfLines = 0
        avviso.textAlignment = .center
        avviso.isHidden = true
        avviso.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(webView)
        view.addSubview(avviso)
        NSLayoutConstraint.activate([
            avviso.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 6),
            avviso.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            avviso.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            webView.topAnchor.constraint(equalTo: avviso.bottomAnchor, constant: 6),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Annulla", style: .plain, target: self, action: #selector(annullaTocco))
        mostraDominio(url)

        timer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.termina(.errore("TEMPO_SCADUTO", "Tempo scaduto"))
        }
        webView.load(URLRequest(url: url))
    }

    /// Il titolo è il dominio della pagina: lo studente vede sempre dove
    /// sta scrivendo le sue credenziali.
    private func mostraDominio(_ u: URL?) {
        navigationItem.title = u?.host ?? "Infostud"
    }

    @objc private func annullaTocco() {
        termina(.errore("ANNULLATA", "Sincronizzazione annullata"))
    }

    // MARK: Navigazione

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        mostraDominio(webView.url)
        // Il suggerimento parla di Infostud: sulle pagine del fornitore
        // di identità confonderebbe.
        if let host = webView.url?.host, !consentiti.contains(host) { avviso.isHidden = true }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        mostraDominio(webView.url)
        // Lo script dell'app gira solo qui, e solo sugli host consentiti:
        // mai sulle pagine del fornitore di identità.
        guard let host = webView.url?.host, consentiti.contains(host) else { return }
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        gestisci(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        gestisci(error)
    }

    private func gestisci(_ errore: Error) {
        let e = errore as NSError
        guard e.domain == NSURLErrorDomain else { return }
        switch e.code {
        case NSURLErrorNotConnectedToInternet, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost,
             NSURLErrorTimedOut, NSURLErrorNetworkConnectionLost, NSURLErrorDNSLookupFailed:
            termina(.errore("IRRAGGIUNGIBILE", "Infostud non raggiungibile"))
        default:
            break   // navigazioni annullate e simili: non sono guasti
        }
    }

    /// Un indirizzo che non è una pagina web (l'app di un fornitore SPID,
    /// per esempio) lo apre il sistema.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let u = navigationAction.request.url, let schema = u.scheme?.lowercased() else {
            decisionHandler(.allow)
            return
        }
        if schema == "http" || schema == "https" || schema == "about" || schema == "blob" || schema == "data" {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(u)
            decisionHandler(.cancel)
        }
    }

    /// Le finestre nuove si aprono nella stessa WebView, che è l'unica
    /// con l'archivio usa-e-getta.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: frame.securityOrigin.host, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    // MARK: Messaggi dalla pagina

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              consentiti.contains(message.frameInfo.securityOrigin.host),
              let corpo = message.body as? [String: Any],
              let tipo = corpo["tipo"] as? String else { return }
        switch tipo {
        case "fase":
            if let f = corpo["fase"] as? String { fase?(f) }
        case "suggerimento":
            avviso.isHidden = false
        case "dati":
            guard let esami = corpo["esami"], let prenotazioni = corpo["prenotazioni"] else { return }
            termina(.dati(["esami": esami, "prenotazioni": prenotazioni]))
        case "errore":
            termina(.errore("LETTURA_FALLITA", (corpo["motivo"] as? String) ?? "Lettura non riuscita"))
        default:
            break
        }
    }

    // MARK: Fine

    /// Chiude tutto una volta sola: ferma la pagina, stacca il canale,
    /// svuota l'archivio e solo allora risponde all'app.
    func termina(_ esito: EsitoSessione) {
        guard !finita else { return }
        finita = true
        timer?.invalidate()
        timer = nil
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: Self.canale)
        archivio.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in
            guard let self else { return }
            self.webView.navigationDelegate = nil
            self.webView.uiDelegate = nil
            let rispondi = self.fine
            self.fine = nil
            self.navigationController?.dismiss(animated: true) { rispondi?(esito) }
        }
    }
}

/// Il canale dei messaggi tiene un riferimento forte a chi li riceve:
/// questo intermediario evita che la sessione resti viva per sempre.
private final class Debole: NSObject, WKScriptMessageHandler {
    weak var bersaglio: WKScriptMessageHandler?
    init(_ bersaglio: WKScriptMessageHandler) { self.bersaglio = bersaglio }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        bersaglio?.userContentController(c, didReceive: m)
    }
}
