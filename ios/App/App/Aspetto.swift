import UIKit
import Capacitor

/// Il tema lo sceglie lo studente nelle impostazioni (Automatico, Chiaro,
/// Scuro) e lo applica la parte web. Qui lo si porta a iOS: barra di
/// stato, tastiera e selettori di data e ora devono seguire l'app, non
/// il sistema. Il lato JavaScript è src/lib/aspetto.ts.
@objc(AspettoPlugin)
public class AspettoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AspettoPlugin"
    public let jsName = "Aspetto"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "imposta", returnType: CAPPluginReturnPromise)
    ]

    static let chiave = "aspetto.tema"

    /// L'ultimo tema scelto: all'avvio la finestra parte già giusta,
    /// prima che la pagina carichi e lo richieda.
    static func stileSalvato() -> UIUserInterfaceStyle {
        stile(UserDefaults.standard.string(forKey: chiave))
    }

    static func stile(_ tema: String?) -> UIUserInterfaceStyle {
        switch tema {
        case "chiaro": return .light
        case "scuro": return .dark
        default: return .unspecified   // automatico: segue il sistema
        }
    }

    @objc func imposta(_ call: CAPPluginCall) {
        let tema = call.getString("tema") ?? "auto"
        UserDefaults.standard.set(tema, forKey: Self.chiave)
        DispatchQueue.main.async { [weak self] in
            // Sulla finestra, così vale anche per i fogli presentati sopra
            // (la WebView di Infostud). La barra di stato ha lo stile
            // "default", che segue da solo il chiaro e lo scuro.
            let vc = self?.bridge?.viewController
            vc?.view.window?.overrideUserInterfaceStyle = Self.stile(tema)
            vc?.setNeedsStatusBarAppearanceUpdate()
            call.resolve()
        }
    }
}

/// La vista principale di Capacitor, con i plugin che vivono dentro
/// l'app invece che in un pacchetto a parte.
class MySapienzaViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AspettoPlugin())
    }
}
