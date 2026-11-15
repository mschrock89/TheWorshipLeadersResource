import UIKit
import Capacitor
import ObjectiveC
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let webCacheVersionKey = "LastLaunchedWebBundleVersion"

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let showApp = {
            let bridge = CAPBridgeViewController()
            self.window = UIWindow(windowScene: windowScene)
            self.window?.backgroundColor = KeyboardChrome.shellColor
            self.window?.rootViewController = bridge
            self.window?.makeKeyAndVisible()
            KeyboardChrome.shared.install(on: bridge)
            SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        }

        // TestFlight updates keep WKWebView's cached index.html, which still
        // points at the previous build's hashed scripts. Those files are gone,
        // so the web view stays blank. Drop the HTTP/script caches before the
        // bridge loads, and leave localStorage alone so people stay signed in.
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: webCacheVersionKey) != version else {
            showApp()
            return
        }

        URLCache.shared.removeAllCachedResponses()

        var didShow = false
        let showOnce = {
            if didShow { return }
            didShow = true
            defaults.set(version, forKey: self.webCacheVersionKey)
            showApp()
        }

        var types: Set<String> = [
            WKWebsiteDataTypeDiskCache,
            WKWebsiteDataTypeMemoryCache,
            WKWebsiteDataTypeOfflineWebApplicationCache,
            WKWebsiteDataTypeServiceWorkerRegistrations,
        ]
        if #available(iOS 17.0, *) {
            types.insert(WKWebsiteDataTypeFetchCache)
        }

        WKWebsiteDataStore.default().removeData(
            ofTypes: types,
            modifiedSince: Date(timeIntervalSince1970: 0)
        ) {
            DispatchQueue.main.async { showOnce() }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { showOnce() }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The iOS keyboard draws a grey form bar (previous / next / done) and a grey
/// backdrop around the keys. Chat is black, so hide that bar and paint the
/// backdrop black while the keyboard is up.
private final class KeyboardChrome: NSObject {
    static let shared = KeyboardChrome()
    /// Matches `ios.backgroundColor` in the Capacitor config.
    static let shellColor = UIColor(red: 28 / 255, green: 31 / 255, blue: 33 / 255, alpha: 1)

    private weak var bridge: CAPBridgeViewController?
    private var observing = false

    func install(on bridge: CAPBridgeViewController) {
        self.bridge = bridge
        guard !observing else {
            applyAccessoryHiding()
            return
        }
        observing = true
        let center = NotificationCenter.default
        let selector = #selector(keyboardFrameChanged(_:))
        center.addObserver(self, selector: selector, name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: selector, name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        center.addObserver(self, selector: selector, name: UIResponder.keyboardWillHideNotification, object: nil)
        DispatchQueue.main.async { [weak self] in
            self?.applyAccessoryHiding()
        }
    }

    @objc private func keyboardFrameChanged(_ notification: Notification) {
        applyAccessoryHiding()
        let screenFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect ?? .zero
        let window = bridge?.view.window
        let frame = window?.convert(screenFrame, from: nil) ?? screenFrame
        let height = window?.bounds.height ?? UIScreen.main.bounds.height
        let keyboardVisible = frame.height > 40 && frame.minY < height - 1
        paint(keyboardVisible ? .black : Self.shellColor)
    }

    private func paint(_ color: UIColor) {
        bridge?.view.window?.backgroundColor = color
        bridge?.view.backgroundColor = color
        bridge?.webView?.backgroundColor = color
        bridge?.webView?.scrollView.backgroundColor = color
        bridge?.webView?.isOpaque = true
    }

    private func applyAccessoryHiding() {
        guard let webView = bridge?.webView else { return }
        hideAccessory(on: webView)
    }

    /// WKWebView installs its own input accessory. Subclass the content view
    /// at runtime so that accessory returns nil and the grey bar never appears.
    private func hideAccessory(on webView: WKWebView) {
        guard let contentView = contentView(in: webView.scrollView) else { return }

        let currentName = NSStringFromClass(type(of: contentView))
        if currentName.contains("NoInputAccessory") { return }

        let subclassName = "NoInputAccessory_\(currentName)"
        let subclass: AnyClass
        if let existing = NSClassFromString(subclassName) {
            subclass = existing
        } else {
            let originalClass: AnyClass = type(of: contentView)
            guard let created = objc_allocateClassPair(originalClass, subclassName, 0) else { return }
            let selector = NSSelectorFromString("inputAccessoryView")
            let block: @convention(block) (AnyObject) -> UIView? = { _ in nil }
            let implementation = imp_implementationWithBlock(block)
            if let method = class_getInstanceMethod(UIResponder.self, selector) {
                class_addMethod(created, selector, implementation, method_getTypeEncoding(method))
            }
            objc_registerClassPair(created)
            subclass = created
        }
        object_setClass(contentView, subclass)
    }

    private func contentView(in view: UIView) -> UIView? {
        if String(describing: type(of: view)).contains("WKContent") { return view }
        for subview in view.subviews {
            if let found = contentView(in: subview) { return found }
        }
        return nil
    }
}
