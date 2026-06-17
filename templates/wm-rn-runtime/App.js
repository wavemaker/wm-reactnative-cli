function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

import React from 'react';
import axios from 'axios';
import { Platform, TouchableOpacity, View } from 'react-native';
import ProtoTypes from 'prop-types';
import { SafeAreaProvider, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { DefaultTheme, Provider as PaperProvider } from 'react-native-paper';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { get, last } from 'lodash';
import { RENDER_LOGGER } from '@wavemaker-ai/app-rn-runtime/core/logger';
import injector from '@wavemaker-ai/app-rn-runtime/core/injector';
import formatters from '@wavemaker-ai/app-rn-runtime/core/formatters';
import { deepCopy, isWebPreviewMode } from '@wavemaker-ai/app-rn-runtime/core/utils';
import { ModalProvider } from '@wavemaker-ai/app-rn-runtime/core/modal.service';
import { ToastProvider } from '@wavemaker-ai/app-rn-runtime/core/toast.service';
import { NavigationServiceProvider } from '@wavemaker-ai/app-rn-runtime/core/navigation.service';
import { PartialProvider } from '@wavemaker-ai/app-rn-runtime/core/partial.service';
import ThemeVariables from '@wavemaker-ai/app-rn-runtime/styles/theme.variables';
import WmMessage from '@wavemaker-ai/app-rn-runtime/components/basic/message/message.component';
import { Animatedview } from '@wavemaker-ai/app-rn-runtime/components/basic/animatedview.component';
import { Watcher } from './watcher';
import AppDisplayManagerService from './services/app-display-manager.service';
import AppModalService from './services/app-modal.service';
import AppToastService from './services/app-toast.service';
import AppPartialService from './services/partial.service';
import { AppNavigator } from './App.navigator';
import { SecurityProvider } from '../core/security.service';
import { CameraProvider } from '../core/device/camera-service';
import CameraService from './services/device/camera-service';
import { ScanProvider } from '../core/device/scan-service';
import ScanService from './services/device/scan-service';
import AppSecurityService from './services/app-security.service';
import StorageService from './services/storage.service';
import { getValidJSON, parseErrors } from '@wavemaker-ai/app-rn-runtime/variables/utils/variable.utils';
import * as SplashScreen from 'expo-splash-screen';
import { WmMemo } from './memo.component';
//some old react libraries need this
View['propTypes'] = {
  style: ProtoTypes.any
};
const MIN_TIME_BETWEEN_REFRESH_CYCLES = 200;

class DrawerImpl {
  constructor(onChange) {
    this.onChange = onChange;

    _defineProperty(this, "content", void 0);

    _defineProperty(this, "animation", 'slide-in');
  }

  setContent(content) {
    this.content = content;
    this.onChange();
  }

  getContent() {
    return this.content;
  }

  setAnimation(animation) {
    this.animation = animation;
    this.onChange();
  }

  getAnimation() {
    return this.animation;
  }

}

const SUPPORTED_SERVICES = {
  StorageService: StorageService,
  AppDisplayManagerService: AppDisplayManagerService
};
export default class BaseApp extends React.Component {
  constructor(props) {
    var _this;

    super(props);
    _this = this;

    _defineProperty(this, "Actions", {});

    _defineProperty(this, "Variables", {});

    _defineProperty(this, "onAppVariablesReady", () => {});

    _defineProperty(this, "isStarted", false);

    _defineProperty(this, "appConfig", injector.get('APP_CONFIG'));

    _defineProperty(this, "baseUrl", '');

    _defineProperty(this, "startUpVariables", []);

    _defineProperty(this, "startUpActions", []);

    _defineProperty(this, "autoUpdateVariables", []);

    _defineProperty(this, "axiosInterceptorIds", []);

    _defineProperty(this, "formatters", formatters);

    _defineProperty(this, "serviceDefinitions", {});

    _defineProperty(this, "animatedRef", void 0);

    _defineProperty(this, "modalsOpened", 0);

    _defineProperty(this, "toastsOpened", 0);

    _defineProperty(this, "watcher", Watcher.ROOT);

    SplashScreen.preventAutoHideAsync();
    this.appConfig.app = this;
    this.appConfig.drawer = new DrawerImpl(() => this.setState({
      't': Date.now()
    }));
    let refreshAfterWait = false;
    this.baseUrl = this.appConfig.url;
    let wait = 0;
    this.bindServiceInterceptors();

    this.appConfig.refresh = function () {
      let complete = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      if (complete) {
        _this.reload();

        return;
      }

      if (!wait) {
        RENDER_LOGGER.debug('refreshing the app...');
        wait = MIN_TIME_BETWEEN_REFRESH_CYCLES;
        refreshAfterWait = false;
        setTimeout(() => {
          var _this$appConfig$curre;

          _this.forceUpdate();

          (_this$appConfig$curre = _this.appConfig.currentPage) === null || _this$appConfig$curre === void 0 ? void 0 : _this$appConfig$curre.forceUpdate();

          _this.watcher.check();
        });
        setTimeout(() => {
          wait = 0;
          refreshAfterWait && _this.appConfig.refresh();
        }, wait);
      } else {
        RENDER_LOGGER.debug('will refresh the app in the next cycle.');
        refreshAfterWait = true;
      }
    };
  }

  goToPage(pageName, params) {
    var _this$appConfig$curre2;

    return (_this$appConfig$curre2 = this.appConfig.currentPage) === null || _this$appConfig$curre2 === void 0 ? void 0 : _this$appConfig$curre2.goToPage(pageName, params);
  }

  goBack(pageName, params) {
    var _this$appConfig$curre3;

    return (_this$appConfig$curre3 = this.appConfig.currentPage) === null || _this$appConfig$curre3 === void 0 ? void 0 : _this$appConfig$curre3.goBack(pageName, params);
  }

  openUrl(url, params) {
    var _this$appConfig$curre4;

    return (_this$appConfig$curre4 = this.appConfig.currentPage) === null || _this$appConfig$curre4 === void 0 ? void 0 : _this$appConfig$curre4.openUrl(url, params);
  }

  onBeforeServiceCall(config) {
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    console.log('onBeforeService call invoked on ' + config.url);
    return config;
  }

  onServiceSuccess(data, response) {}

  onServiceError(errorMsg, error) {}

  onPageReady(activePageName, activePageScope) {}

  openBrowser(url) {
    let params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    if (url) {
      if (isWebPreviewMode()) {
        window.open(url, '_blank');
      } else if (url.startsWith('http') && params.target === '_blank') {
        WebBrowser.openBrowserAsync(url);
      } else {
        return Linking.openURL(url);
      }
    }

    return Promise.resolve();
  } // To support old api


  reload() {}

  bindServiceInterceptors() {
    this.axiosInterceptorIds = [axios.interceptors.request.use(config => this.onBeforeServiceCall(config)), axios.interceptors.response.use(response => {
      this.onServiceSuccess(response.data, response);
      return response;
    }, error => {
      var _errorDetails, _errorDetails2, _error$response, _error$response$confi, _error$response2;

      let errorDetails = error.response,
          errMsg;
      errorDetails = getValidJSON((_errorDetails = errorDetails) === null || _errorDetails === void 0 ? void 0 : _errorDetails.data) || ((_errorDetails2 = errorDetails) === null || _errorDetails2 === void 0 ? void 0 : _errorDetails2.data);

      if (errorDetails && errorDetails.errors) {
        errMsg = parseErrors(errorDetails.errors) || "Service Call Failed";
      } else {
        errMsg = errMsg || "Service Call Failed";
      }

      error.message = errMsg;
      this.onServiceError(error.message, error);

      if ((_error$response = error.response) !== null && _error$response !== void 0 && (_error$response$confi = _error$response.config.url) !== null && _error$response$confi !== void 0 && _error$response$confi.startsWith(this.appConfig.url) && ((_error$response2 = error.response) === null || _error$response2 === void 0 ? void 0 : _error$response2.status) === 401) {
        var _this$appConfig$curre5, _this$appConfig$curre6;

        ((_this$appConfig$curre5 = this.appConfig.currentPage) === null || _this$appConfig$curre5 === void 0 ? void 0 : _this$appConfig$curre5.pageName) !== 'Login' && ((_this$appConfig$curre6 = this.appConfig.currentPage) === null || _this$appConfig$curre6 === void 0 ? void 0 : _this$appConfig$curre6.goToPage('Login'));
      }

      return Promise.reject(error);
    })];
  }

  eval(fn) {
    let failOnError = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    try {
      return fn.call(this);
    } catch (e) {
      if (failOnError) {
        throw e;
      } else {
        return null;
      }
    }
  }

  componentDidMount() {
    Promise.all(this.startUpVariables.map(s => this.Variables[s] && this.Variables[s].invoke())).then(() => {
      this.onAppVariablesReady();
      this.isStarted = true;
      this.forceUpdate(); // TODO: Without callback, splashscreen was not getting hidden in ios mobile app. Later, remove the empty function.

      SplashScreen.hideAsync().then(() => {});
    });
    this.startUpActions.map(a => this.Actions[a] && this.Actions[a].invoke());
  }

  componentWillUnmount() {
    this.axiosInterceptorIds.map(id => {
      axios.interceptors.request.eject(id);
    });
  }

  refresh() {
    this.appConfig.refresh();
  }

  getProviders(content) {
    return /*#__PURE__*/React.createElement(NavigationServiceProvider, {
      value: this
    }, /*#__PURE__*/React.createElement(ToastProvider, {
      value: AppToastService
    }, /*#__PURE__*/React.createElement(PartialProvider, {
      value: AppPartialService
    }, /*#__PURE__*/React.createElement(SecurityProvider, {
      value: AppSecurityService
    }, /*#__PURE__*/React.createElement(CameraProvider, {
      value: CameraService
    }, /*#__PURE__*/React.createElement(ScanProvider, {
      value: ScanService
    }, /*#__PURE__*/React.createElement(ModalProvider, {
      value: AppModalService
    }, content)))))));
  }

  renderToasters() {
    this.toastsOpened = AppToastService.toastsOpened.length;
    return /*#__PURE__*/React.createElement(WmMemo, {
      watcher: this.watcher,
      render: watch => {
        watch(() => AppToastService.toastsOpened);
        return /*#__PURE__*/React.createElement(React.Fragment, null, AppToastService.toastsOpened.map((o, i) => /*#__PURE__*/React.createElement(View, {
          key: i,
          style: [{
            position: 'absolute',
            width: '100%',
            elevation: o.elevationIndex,
            zIndex: o.elevationIndex
          }, o.styles]
        }, /*#__PURE__*/React.createElement(TouchableOpacity, {
          onPress: () => o.onClick && o.onClick()
        }, o.content, /*#__PURE__*/React.createElement(WmMessage, {
          type: o.type,
          caption: o.text,
          hideclose: true
        })))));
      }
    });
  }

  renderDialogs() {
    return /*#__PURE__*/React.createElement(WmMemo, {
      watcher: this.watcher,
      render: watch => {
        watch(() => {
          var _last;

          return (_last = last(AppModalService.modalsOpened)) === null || _last === void 0 ? void 0 : _last.content;
        });
        this.modalsOpened = AppModalService.modalsOpened.length;
        AppModalService.animatedRefs.length = 0;
        return /*#__PURE__*/React.createElement(React.Fragment, null, AppModalService.modalOptions.content && AppModalService.modalsOpened.map((o, i) => {
          return /*#__PURE__*/React.createElement(View, {
            key: (o.name || '') + i,
            onStartShouldSetResponder: () => true,
            onResponderEnd: () => o.isModal && AppModalService.hideModal(o),
            style: deepCopy(styles.appModal, o.centered ? styles.centeredModal : null, o.modalStyle, {
              elevation: o.elevationIndex,
              zIndex: o.elevationIndex
            })
          }, /*#__PURE__*/React.createElement(Animatedview, {
            entryanimation: o.animation || 'fadeIn',
            ref: ref => {
              this.animatedRef = ref;
              AppModalService.animatedRefs[i] = ref;
            },
            style: [styles.appModalContent, o.contentStyle]
          }, /*#__PURE__*/React.createElement(View, {
            onStartShouldSetResponder: evt => true,
            onResponderEnd: e => e.stopPropagation(),
            style: {
              width: '100%',
              'alignItems': 'center'
            }
          }, this.getProviders(o.content))));
        }));
      }
    });
  }

  renderDisplayManager() {
    return /*#__PURE__*/React.createElement(WmMemo, {
      watcher: this.watcher,
      render: watch => {
        watch(() => AppDisplayManagerService.displayOptions.content);
        return AppDisplayManagerService.displayOptions.content ? /*#__PURE__*/React.createElement(View, {
          style: [styles.displayViewContainer, {
            elevation: this.toastsOpened + this.modalsOpened + 1,
            zIndex: this.toastsOpened + this.modalsOpened + 1
          }]
        }, AppDisplayManagerService.displayOptions.content) : null;
      }
    });
  }

  renderIconsViewSupportForWeb() {
    try {
      return /*#__PURE__*/React.createElement("style", {
        type: "text/css"
      }, `
        @font-face {
          font-family: 'MaterialCommunityIcons';
          src: url(${require('react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf')}) format('truetype');
        }
      `);
    } catch (e) {
      console.log('require react-native-vector-icons could not be loaded.');
    }

    return null;
  }

  getSelectedLocale() {
    return this.appConfig.selectedLocale;
  }

  getDependency(serviceName) {
    const service = get(SUPPORTED_SERVICES, serviceName);

    if (service) {
      return service;
    }
  }

  renderApp(commonPartial) {
    var _this2 = this;
    console.error("BOYINA : " + JSON.stringify(this.props));
    this.autoUpdateVariables.forEach(value => {
      var _this$Variables$value;

      return (_this$Variables$value = this.Variables[value]) === null || _this$Variables$value === void 0 ? void 0 : _this$Variables$value.invokeOnParamChange();
    });
    return /*#__PURE__*/React.createElement(SafeAreaProvider, null, /*#__PURE__*/React.createElement(PaperProvider, {
      theme: { ...DefaultTheme,
        colors: { ...DefaultTheme.colors,
          primary: ThemeVariables.primaryColor
        }
      }
    }, /*#__PURE__*/React.createElement(React.Fragment, null, Platform.OS === 'web' ? this.renderIconsViewSupportForWeb() : null, /*#__PURE__*/React.createElement(SafeAreaInsetsContext.Consumer, null, function () {
      var _this2$appConfig$draw, _this2$appConfig$draw2;

      let insets = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      };
      return _this2.getProviders( /*#__PURE__*/React.createElement(View, {
        style: [styles.container, {
          paddingTop: (insets === null || insets === void 0 ? void 0 : insets.top) || 0,
          paddingBottom: insets === null || insets === void 0 ? void 0 : insets.bottom,
          paddingLeft: insets === null || insets === void 0 ? void 0 : insets.left,
          paddingRight: insets === null || insets === void 0 ? void 0 : insets.right
        }]
      }, /*#__PURE__*/React.createElement(View, {
        style: styles.container
      }, /*#__PURE__*/React.createElement(AppNavigator, {
        app: _this2,
        landingPage: _this2.props.pageName,
        hideDrawer: ((_this2$appConfig$draw = _this2.appConfig.drawer) === null || _this2$appConfig$draw === void 0 ? void 0 : _this2$appConfig$draw.getContent()) === null,
        drawerContent: () => _this2.appConfig.drawer ? _this2.getProviders(_this2.appConfig.drawer.getContent()) : null,
        drawerAnimation: (_this2$appConfig$draw2 = _this2.appConfig.drawer) === null || _this2$appConfig$draw2 === void 0 ? void 0 : _this2$appConfig$draw2.getAnimation()
      }), commonPartial)));
    }), this.renderToasters(), this.renderDialogs(), this.renderDisplayManager())));
  }

}
const styles = {
  container: {
    flex: 1
  },
  appModal: {
    position: 'absolute',
    width: '100%'
  },
  appModalContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  centeredModal: {
    flex: 1,
    position: 'absolute',
    top: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    height: '100%'
  },
  displayViewContainer: {
    position: 'absolute',
    justifyContent: 'center',
    width: '100%',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  }
};
//# sourceMappingURL=App.js.map