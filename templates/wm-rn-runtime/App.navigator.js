import React from 'react';
import { Platform, View, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { isWebPreviewMode } from '@wavemaker-ai/app-rn-runtime/core/utils';
import injector from '@wavemaker-ai/app-rn-runtime/core/injector';
import AppDrawerNavigator from './navigator/drawer.navigator';
import AppStackNavigator from './navigator/stack.navigator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isEmpty, keys, last } from 'lodash';

const getStateFromPath = (path, options) => {
  let hash = window.location.hash;
  hash = hash.substring(1);

  if (hash && hash.startsWith('/')) {
    hash = hash.substring(1);
  }

  if (!hash) {
    return;
  }

  let [pageName, paramstr] = hash.split('?');
  let params = {};

  if (paramstr) {
    paramstr.split('&').forEach(p => {
      const [k, v] = p.split('=');
      params[k] = v;
    });
  }

  return {
    routes: [{
      name: 'pages',
      state: {
        index: 0,
        routes: [{
          name: pageName,
          params: params
        }]
      }
    }]
  };
};

const getPathFromState = (state, options) => {
  const pagesRoute = state === null || state === void 0 ? void 0 : state.routes[0];
  const pageRoute = last(pagesRoute === null || pagesRoute === void 0 ? void 0 : pagesRoute.state.routes);
  let path = '';

  if (pageRoute) {
    path = window.location.href.split('#')[0] + '#/' + pageRoute.name;

    if (!isEmpty(pageRoute.params)) {
      path += '?' + keys(pageRoute.params).map(k => {
        return `${k}=${pageRoute.params[k]}`;
      }).join('&');
    }
  }

  return path;
};

export const AppNavigator = props => {
  var _appConfig$pages;

  const appConfig = injector.get('APP_CONFIG');
  const pages = {};
  const linking = {
    config: {
      screens: {
        "pages": {
          path: "pages",
          screens: pages
        }
      }
    },
    getStateFromPath: isWebPreviewMode() ? getStateFromPath : undefined,
    getPathFromState: isWebPreviewMode() ? getPathFromState : undefined
  };
  (_appConfig$pages = appConfig.pages) === null || _appConfig$pages === void 0 ? void 0 : _appConfig$pages.forEach(p => {
    //@ts-ignore
    pages[p.name] = p.name;
  });
  const stack = /*#__PURE__*/React.createElement(AppStackNavigator, {
    pages: appConfig.pages || [],
    landingPage: props.landingPage || appConfig.landingPage
  });
  const leftNav = /*#__PURE__*/React.createElement(AppDrawerNavigator, {
    type: props.drawerAnimation === 'slide-over' ? 'front' : 'slide',
    hide: props.hideDrawer,
    content: () => /*#__PURE__*/React.createElement(SafeAreaView, {
      style: [{
        flex: 1
      }, Platform.OS === 'ios' ? {
        paddingTop: -40
      } : {}]
    }, /*#__PURE__*/React.createElement(StatusBar, {
      barStyle: "light-content",
      backgroundColor: "#000000"
    }), props.drawerContent && props.drawerContent() || /*#__PURE__*/React.createElement(View, null)),
    rootComponent: stack
  });
  return /*#__PURE__*/React.createElement(NavigationContainer, {
    linking: linking
  }, leftNav);
};
//# sourceMappingURL=App.navigator.js.map